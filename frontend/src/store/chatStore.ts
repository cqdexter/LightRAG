import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Conversation, Message, ChatSettings } from '../types';
import { streamQuery, buildConversationHistory } from '../lib/api';
import * as db from '../lib/db';

// Track in-flight conversation creation to prevent FK race conditions on rapid sends
const pendingConversationCreation = new Map<string, Promise<void>>();

function generateId(): string {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function truncateTitle(text: string): string {
  return text.length > 30 ? text.slice(0, 30) + '…' : text;
}

interface ChatStore {
  conversations: Conversation[];
  messages: Record<string, Message[]>;
  currentConvId: string | null;
  isLoading: boolean;
  streamingContent: string;
  settings: ChatSettings;
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
  isInitialized: boolean;

  initializeFromServer: () => Promise<void>;
  loadConversationMessages: (id: string) => Promise<void>;
  newConversation: () => string;
  switchConversation: (id: string) => void;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;
  sendMessage: (text: string) => Promise<void>;
  sendFeedback: (convId: string, msgId: string, feedback: 'useful' | 'useless' | undefined) => void;
  regenerateMessage: (convId: string, msgId: string) => Promise<void>;
  updateSettings: (s: Partial<ChatSettings>) => void;
  setSidebarOpen: (open: boolean) => void;
  toggleTheme: () => void;
  cancelStream: () => void;
}

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      conversations: [],
      messages: {},
      currentConvId: null,
      isLoading: false,
      streamingContent: '',
      settings: {
        baseUrl: import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '/api' : ''),
        apiKey: import.meta.env.VITE_API_KEY || '',
        mode: import.meta.env.VITE_QUERY_MODE || 'mix',
        topK: Number(import.meta.env.VITE_TOP_K) || 60,
      },
      sidebarOpen: true,
      theme: 'light',
      isInitialized: false,

      initializeFromServer: async () => {
        try {
          const convs = await db.loadConversations();
          set({ conversations: convs, isInitialized: true });
        } catch (err) {
          console.error('Failed to load conversations from server:', err);
          set({ isInitialized: true });
        }
      },

      loadConversationMessages: async (id) => {
        try {
          const msgs = await db.loadMessages(id);
          set((s) => ({
            messages: { ...s.messages, [id]: msgs },
          }));
        } catch (err) {
          console.error('Failed to load messages:', err);
        }
      },

      newConversation: () => {
        const id = generateId();
        const conv: Conversation = { id, title: '新对话', updatedAt: Date.now() };
        set((s) => ({
          conversations: [conv, ...s.conversations],
          currentConvId: id,
          messages: { ...s.messages, [id]: [] },
          streamingContent: '',
        }));
        return id;
      },

      switchConversation: (id) => {
        set({ currentConvId: id, streamingContent: '' });
        get().loadConversationMessages(id);
      },

      deleteConversation: async (id) => {
        const prevConvs = get().conversations;
        const prevMsgs = { ...get().messages };
        set((s) => {
          const convs = s.conversations.filter((c) => c.id !== id);
          const msgs = { ...s.messages };
          delete msgs[id];
          const nextId = s.currentConvId === id
            ? (convs[0]?.id ?? null)
            : s.currentConvId;
          return { conversations: convs, messages: msgs, currentConvId: nextId, streamingContent: '' };
        });

        try {
          await db.deleteConversation(id);
        } catch (err) {
          console.error('Failed to delete from server, rolling back:', err);
          set({ conversations: prevConvs, messages: prevMsgs });
        }
      },

      renameConversation: async (id, title) => {
        set((s) => ({
          conversations: s.conversations.map((c) =>
            c.id === id ? { ...c, title } : c
          ),
        }));
        try {
          await db.updateConversationTitle(id, title);
        } catch (err) {
          console.error('Failed to rename on server:', err);
        }
      },

      sendMessage: async (text) => {
        const state = get();
        if (!text.trim() || state.isLoading) return;
        if (!state.settings.baseUrl) return;

        const userMsg: Message = { id: generateId(), role: 'user', content: text };
        const aiMsg: Message = { id: generateId(), role: 'assistant', content: '', references: [] };

        let convId = state.currentConvId;
        let isNew = false;
        if (!convId) {
          convId = get().newConversation();
          isNew = true;
        }
        const conv = get().conversations.find((c) => c.id === convId);
        const title = conv && conv.title === '新对话' ? truncateTitle(text) : conv?.title ?? '新对话';
        if (conv && conv.title === '新对话') {
          set((s) => ({
            conversations: s.conversations.map((c) =>
              c.id === convId ? { ...c, title } : c
            ),
          }));
        }

        // Batch-persist to server: create conversation (with final title) + both messages
        const doPersist = async () => {
          if (isNew) {
            const p = db.createConversation(convId, title, Date.now());
            pendingConversationCreation.set(convId, p);
            await p;
            pendingConversationCreation.delete(convId);
          } else {
            // Wait for any in-flight conversation creation before inserting
            await pendingConversationCreation.get(convId);
            await db.updateConversationTimestamp(convId);
          }
          await db.insertMessage({ ...userMsg, conversation_id: convId });
          await db.insertMessage({ ...aiMsg, conversation_id: convId });
        };
        doPersist().catch((err) => console.error('Failed to persist to server:', err));

        const history = buildConversationHistory([...(get().messages[convId] || [])]);

        set((s) => ({
          messages: {
            ...s.messages,
            [convId]: [...(s.messages[convId] || []), userMsg, aiMsg],
          },
          isLoading: true,
          streamingContent: '',
          conversations: s.conversations.map((c) =>
            c.id === convId ? { ...c, updatedAt: Date.now() } : c
          ),
        }));

        const aiMsgIndex = (get().messages[convId]?.length ?? 0) - 1;

        try {
          await streamQuery(text, state.settings, history, {
            onReferences: (refs) => {
              set((s) => {
                const msgs = [...(s.messages[convId] || [])];
                if (msgs[aiMsgIndex]) msgs[aiMsgIndex] = { ...msgs[aiMsgIndex], references: refs };
                return { messages: { ...s.messages, [convId]: msgs } };
              });
            },
            onChunk: (chunk) => {
              set((s) => ({
                streamingContent: s.streamingContent + chunk,
              }));
            },
            onError: (err) => {
              throw new Error(err);
            },
          });

          const fullContent = get().streamingContent;
          set((s) => {
            const msgs = [...(s.messages[convId] || [])];
            if (msgs[aiMsgIndex]) msgs[aiMsgIndex] = { ...msgs[aiMsgIndex], content: fullContent };
            return { messages: { ...s.messages, [convId]: msgs }, streamingContent: '' };
          });
          db.updateMessageContent(aiMsg.id, fullContent).catch((err) =>
            console.error('Failed to update AI message on server:', err)
          );
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          set((s) => {
            const msgs = [...(s.messages[convId] || [])];
            if (msgs[aiMsgIndex]) {
              msgs[aiMsgIndex] = { ...msgs[aiMsgIndex], content: errorMessage, isError: true };
            }
            return { messages: { ...s.messages, [convId]: msgs }, streamingContent: '' };
          });
        } finally {
          set({ isLoading: false });
        }
      },

      updateSettings: (partial) => {
        set((s) => ({ settings: { ...s.settings, ...partial } }));
      },

      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      toggleTheme: () => {
        const next = get().theme === 'light' ? 'dark' : 'light';
        document.documentElement.classList.toggle('dark', next === 'dark');
        set({ theme: next });
      },

      cancelStream: () => {
        set({ isLoading: false, streamingContent: '' });
      },

      sendFeedback: (convId, msgId, feedback) => {
        set((s) => {
          const msgs = [...(s.messages[convId] || [])];
          const idx = msgs.findIndex((m) => m.id === msgId);
          if (idx === -1) return s;
          msgs[idx] = { ...msgs[idx], feedback };
          return { messages: { ...s.messages, [convId]: msgs } };
        });
        db.updateMessageFeedback(msgId, feedback ?? null).catch((err) =>
          console.error('Failed to update feedback:', err)
        );
      },

      regenerateMessage: async (convId, msgId) => {
        const state = get();
        const msgs = state.messages[convId] || [];
        const aiIdx = msgs.findIndex((m) => m.id === msgId);
        if (aiIdx === -1 || state.isLoading) return;

        const userMsg = msgs[aiIdx - 1];
        if (!userMsg || userMsg.role !== 'user') return;

        // Remove old AI message from DB and UI
        const trimmed = msgs.slice(0, aiIdx);
        db.deleteMessage(msgId).catch((err) =>
          console.error('Failed to delete old message during regenerate:', err)
        );
        const aiMsg: Message = { id: generateId(), role: 'assistant', content: '', references: [] };

        // Insert new AI placeholder to DB
        db.insertMessage({ ...aiMsg, conversation_id: convId }).catch((err) =>
          console.error('Failed to insert regenerated AI placeholder:', err)
        );

        set((s) => ({
          messages: { ...s.messages, [convId]: [...trimmed, aiMsg] },
          isLoading: true,
          streamingContent: '',
        }));

        const aiMsgIndex = get().messages[convId]!.length - 1;
        const history = buildConversationHistory(trimmed);

        try {
          await streamQuery(userMsg.content, state.settings, history, {
            onReferences: (refs) => {
              set((s) => {
                const msgs2 = [...(s.messages[convId] || [])];
                if (msgs2[aiMsgIndex]) msgs2[aiMsgIndex] = { ...msgs2[aiMsgIndex], references: refs };
                return { messages: { ...s.messages, [convId]: msgs2 } };
              });
            },
            onChunk: (chunk) => {
              set((s) => ({ streamingContent: s.streamingContent + chunk }));
            },
            onError: (err) => { throw new Error(err); },
          });

          const fullContent = get().streamingContent;
          set((s) => {
            const msgs2 = [...(s.messages[convId] || [])];
            if (msgs2[aiMsgIndex]) msgs2[aiMsgIndex] = { ...msgs2[aiMsgIndex], content: fullContent };
            return { messages: { ...s.messages, [convId]: msgs2 }, streamingContent: '' };
          });
          db.updateMessageContent(aiMsg.id, fullContent).catch((err) =>
            console.error('Failed to update regenerated message content:', err)
          );
        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          set((s) => {
            const msgs2 = [...(s.messages[convId] || [])];
            if (msgs2[aiMsgIndex]) msgs2[aiMsgIndex] = { ...msgs2[aiMsgIndex], content: errorMessage, isError: true };
            return { messages: { ...s.messages, [convId]: msgs2 }, streamingContent: '' };
          });
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'lightrag_react_store',
      partialize: (state) => ({
        settings: {
          apiKey: state.settings.apiKey,
          mode: state.settings.mode,
          topK: state.settings.topK,
        },
        theme: state.theme,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.settings.baseUrl = import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '/api' : '');
        }
      },
    }
  )
);
