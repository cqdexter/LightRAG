import { useState, useMemo, useCallback } from 'react';
import { Copy, RefreshCw, ThumbsUp, ThumbsDown, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight, oneDark } from 'react-syntax-highlighter/dist/cjs/styles/prism';
import type { Message } from '../types';
import { useChatStore } from '../store/chatStore';

function parseCOTContent(content: string) {
  const thinkStart = '<think>';
  const thinkEnd = '</think>';
  const startIdx = content.lastIndexOf(thinkStart);
  const endIdx = content.lastIndexOf(thinkEnd);

  if (startIdx === -1) {
    return { thinkingContent: '', displayContent: content, isThinking: false };
  }

  if (endIdx > startIdx) {
    const thinkingContent = content.substring(startIdx + thinkStart.length, endIdx).trim();
    const displayContent = content.substring(endIdx + thinkEnd.length).trim();
    return { thinkingContent, displayContent, isThinking: false };
  }

  const thinkingContent = content.substring(startIdx + thinkStart.length).trim();
  const displayContent = content.substring(0, startIdx).trim();
  return { thinkingContent, displayContent, isThinking: true };
}

interface Props {
  message: Message;
  isStreaming?: boolean;
  streamingContent?: string;
}

export default function MessageBubble({ message, isStreaming, streamingContent }: Props) {
  const theme = useChatStore((s) => s.theme);
  const currentConvId = useChatStore((s) => s.currentConvId);
  const sendFeedback = useChatStore((s) => s.sendFeedback);
  const regenerateMessage = useChatStore((s) => s.regenerateMessage);
  const [showRefs, setShowRefs] = useState(false);
  const [thinkingExpanded, setThinkingExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const rawContent = isStreaming ? (streamingContent || '') : message.content;

  const { thinkingContent, displayContent, isThinking } = useMemo(() => {
    const parsed = parseCOTContent(rawContent);
    let cleaned = parsed.displayContent;
    cleaned = cleaned.replace(/^#{1,3}\s*(?:References|参考文献|参考资料)\s*$[\s\S]*/im, '');
    cleaned = cleaned.replace(/^\*{0,2}(?:References|参考文献|参考资料)\*{0,2}\s*$[\s\S]*/im, '');
    cleaned = cleaned.replace(/^参考资料[：:][\s\S]*/im, '');
    cleaned = cleaned.replace(/(\n\[\d+\][^\n]*)+$/, '');
    cleaned = cleaned.trim();
    return { ...parsed, displayContent: cleaned };
  }, [rawContent]);

  const copyContent = useCallback(() => {
    navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.content]);

  const handleFeedback = useCallback(
    (feedback: 'useful' | 'useless') => {
      if (!currentConvId) return;
      const newVal = message.feedback === feedback ? undefined : feedback;
      sendFeedback(currentConvId, message.id, newVal);
    },
    [currentConvId, message.id, message.feedback, sendFeedback]
  );

  if (message.role === 'user') {
    return (
      <div className="self-end flex flex-col items-end gap-1 max-w-[80%]">
        <div
          className="px-4 py-2.5 rounded-2xl rounded-br-md"
          style={{ background: 'var(--color-primary)', color: '#fff' }}
        >
          <div className="whitespace-pre-wrap text-sm leading-relaxed">{message.content}</div>
        </div>
        <ActionButton
          icon={copied ? Check : Copy}
          label={copied ? '已复制' : '复制'}
          onClick={copyContent}
          active={copied}
        />
      </div>
    );
  }

  return (
    <div className="self-start flex flex-col items-start gap-1 max-w-[88%]">
      <div
        className="px-4 py-2.5 rounded-2xl rounded-bl-md w-full"
        style={{
          background: 'var(--color-surface)',
          border: '1px solid var(--color-border)',
          color: 'var(--color-text)',
        }}
      >
        {message.isError ? (
          <div style={{ color: 'var(--color-error)' }}>Error: {displayContent}</div>
        ) : (
          <>
            {(isThinking || thinkingContent) && (
              <div className="mb-2 text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                <div
                  className="flex items-center gap-1 cursor-pointer select-none hover:opacity-70 transition-opacity"
                  onClick={() => thinkingContent && setThinkingExpanded(!thinkingExpanded)}
                >
                  {isThinking ? (
                    <>
                      <span className="size-2 rounded-full bg-current animate-ping" />
                      <span>思考中...</span>
                    </>
                  ) : (
                    <span>已思考 {thinkingContent.length} 字 {thinkingExpanded ? '▲' : '▼'}</span>
                  )}
                </div>
                {thinkingExpanded && thinkingContent && (
                  <div className="mt-1 pl-3 border-l-2 opacity-70 whitespace-pre-wrap">
                    {thinkingContent}
                  </div>
                )}
              </div>
            )}
            <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed prose-p:my-1 prose-pre:my-2 prose-code:before:content-none prose-code:after:content-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  code({ className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || '');
                    const language = match ? match[1] : undefined;
                    if (language) {
                      return (
                        <SyntaxHighlighter
                          style={theme === 'dark' ? oneDark : oneLight}
                          language={language}
                          PreTag="div"
                        >
                          {String(children).replace(/\n$/, '')}
                        </SyntaxHighlighter>
                      );
                    }
                    return (
                      <code
                        className="px-1 py-0.5 rounded text-sm"
                        style={{ background: 'var(--color-border)' }}
                        {...props}
                      >
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {displayContent || (isStreaming ? '' : ' ')}
              </ReactMarkdown>
            </div>
            {message.references && message.references.length > 0 && (
              <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--color-border)' }}>
                <button
                  onClick={() => setShowRefs(!showRefs)}
                  className="text-xs"
                  style={{ color: 'var(--color-text-secondary)' }}
                >
                  {message.references.length} 个来源 {showRefs ? '▲' : '▼'}
                </button>
                {showRefs && (
                  <div className="mt-1 space-y-0.5">
                    {message.references.map((ref, i) => (
                      <div
                        key={i}
                        className="text-xs"
                        style={{ color: 'var(--color-text-secondary)' }}
                      >
                        {ref.file_path || ref.reference_id}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
      {!isStreaming && !message.isError && (
        <div className="flex items-center gap-0.5 px-1">
          <ActionButton icon={Copy} label="复制" onClick={copyContent} active={copied} />
          <ActionButton
            icon={RefreshCw}
            label="重新生成"
            onClick={() => currentConvId && regenerateMessage(currentConvId, message.id)}
          />
          <ActionButton
            icon={ThumbsUp}
            label="有用"
            onClick={() => handleFeedback('useful')}
            active={message.feedback === 'useful'}
          />
          <ActionButton
            icon={ThumbsDown}
            label="无用"
            onClick={() => handleFeedback('useless')}
            active={message.feedback === 'useless'}
          />
        </div>
      )}
    </div>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onClick,
  active = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] transition-colors"
      style={{
        color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
        opacity: active ? 1 : 0.5,
      }}
      onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = 'var(--color-border)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.opacity = active ? '1' : '0.5'; e.currentTarget.style.background = 'transparent'; }}
    >
      <Icon className="size-3" />
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
