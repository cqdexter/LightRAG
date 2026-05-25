import { useEffect, useRef } from 'react';
import MessageBubble from './MessageBubble';
import TypingIndicator from './TypingIndicator';
import { useChatStore } from '../store/chatStore';

export default function MessageList() {
  const currentConvId = useChatStore((s) => s.currentConvId);
  const messages = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoading);
  const streamingContent = useChatStore((s) => s.streamingContent);
  const bottomRef = useRef<HTMLDivElement>(null);

  const convMessages = currentConvId ? (messages[currentConvId] || []) : [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [convMessages.length, streamingContent]);

  if (convMessages.length === 0) {
    return (
      <div
        className="flex-1 flex flex-col items-center justify-center gap-4 px-6 text-center"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <div className="text-5xl">📚</div>
        <div className="text-xl font-semibold" style={{ color: 'var(--color-text)' }}>
          獬小图智慧咨询
        </div>
        <div className="text-sm max-w-md leading-relaxed">
          您好！我是獬小图，您的图书馆智慧助手。
          请描述您遇到的图书馆资源或服务问题，我将为您提供参考信息。
        </div>
        <div className="text-xs mt-2 opacity-60">
          本助手提供的信息仅供参考，不足之处敬请见谅。
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {convMessages.map((msg, i) => {
        const isLastAssistant = i === convMessages.length - 1 && msg.role === 'assistant';
        return (
          <MessageBubble
            key={msg.id}
            message={msg}
            isStreaming={isLastAssistant && isLoading && !msg.content}
            streamingContent={isLastAssistant ? streamingContent : undefined}
          />
        );
      })}
      {isLoading && !streamingContent && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}
