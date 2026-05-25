import { useState, useRef, useEffect } from 'react';
import { ArrowUp } from 'lucide-react';
import { useChatStore } from '../store/chatStore';

export default function InputArea() {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const isLoading = useChatStore((s) => s.isLoading);
  const settings = useChatStore((s) => s.settings);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 160) + 'px';
    }
  }, [text]);

  const handleSend = () => {
    if (!text.trim() || isLoading) return;
    sendMessage(text);
    setText('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div
      className="px-4 py-3 shrink-0"
      style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg)' }}
    >
      <div className="flex items-end gap-2 max-w-3xl mx-auto relative">
        {!settings.baseUrl && (
          <div
            className="absolute -top-6 left-0 right-0 text-center text-xs"
            style={{ color: 'var(--color-text-secondary)' }}
          >
            请先在设置中配置 API 地址
          </div>
        )}
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入你的问题..."
          rows={1}
          className="flex-1 rounded-xl border px-4 py-2.5 text-sm outline-none resize-none transition-colors"
          style={{
            borderColor: 'var(--color-border)',
            background: 'var(--color-surface)',
            color: 'var(--color-text)',
          }}
          disabled={isLoading}
        />
        <button
          onClick={handleSend}
          disabled={!text.trim() || isLoading}
          className="size-10 rounded-full flex items-center justify-center shrink-0 transition-opacity"
          style={{ background: 'var(--color-primary)', color: '#fff' }}
        >
          <ArrowUp className="size-5" />
        </button>
      </div>
    </div>
  );
}
