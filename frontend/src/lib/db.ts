import type { Conversation, Message, Reference } from '../types';

const BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL || (import.meta.env.PROD ? '/api' : '');

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${BASE_URL.replace(/\/+$/, '')}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

export async function loadConversations(): Promise<Conversation[]> {
  const data: Array<{ id: string; title: string; updated_at: string }> =
    await apiFetch('/conversations');
  return data.map((row) => ({
    id: row.id,
    title: row.title,
    updatedAt: new Date(row.updated_at).getTime(),
  }));
}

interface MessageRow {
  id: string;
  role: string;
  content: string;
  references?: Reference[] | null;
  is_error?: boolean;
  feedback?: string | null;
  created_at: string;
}

export async function loadMessages(convId: string): Promise<Message[]> {
  const data: MessageRow[] = await apiFetch(`/conversations/${convId}/messages`);
  return data.map((row) => ({
    id: row.id,
    role: row.role as 'user' | 'assistant',
    content: row.content,
    references: row.references ?? undefined,
    isError: row.is_error ?? false,
    feedback: (row.feedback ?? undefined) as 'useful' | 'useless' | undefined,
  }));
}

export async function createConversation(
  id: string,
  title: string,
  updatedAt: number,
): Promise<void> {
  await apiFetch('/conversations', {
    method: 'POST',
    body: JSON.stringify({
      id,
      title,
      updated_at: new Date(updatedAt).toISOString(),
    }),
  });
}

export async function deleteConversation(id: string): Promise<void> {
  await apiFetch(`/conversations/${id}`, { method: 'DELETE' });
}

export async function updateConversationTitle(
  id: string,
  title: string,
): Promise<void> {
  await apiFetch(`/conversations/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      title,
      updated_at: new Date().toISOString(),
    }),
  });
}

export async function updateConversationTimestamp(id: string): Promise<void> {
  await apiFetch(`/conversations/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ updated_at: new Date().toISOString() }),
  });
}

export async function insertMessage(
  msg: Message & { conversation_id: string },
): Promise<void> {
  await apiFetch(`/conversations/${msg.conversation_id}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      id: msg.id,
      conversation_id: msg.conversation_id,
      role: msg.role,
      content: msg.content,
      references: msg.references ? JSON.stringify(msg.references) : null,
      is_error: msg.isError ?? false,
    }),
  });
}

export async function updateMessageContent(
  id: string,
  content: string,
): Promise<void> {
  await apiFetch(`/messages/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
}

export async function deleteMessage(id: string): Promise<void> {
  await apiFetch(`/messages/${id}`, { method: 'DELETE' });
}

export async function updateMessageFeedback(
  id: string,
  feedback: 'useful' | 'useless' | null,
): Promise<void> {
  await apiFetch(`/messages/${id}/feedback`, {
    method: 'PUT',
    body: JSON.stringify({ feedback }),
  });
}
