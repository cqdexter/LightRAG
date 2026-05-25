import { Moon, Sun, Menu, Ban } from 'lucide-react';
import { useChatStore } from '../store/chatStore';

interface Props {
  onToggleSidebar: () => void;
}

export default function Header({ onToggleSidebar }: Props) {
  const currentConvId = useChatStore((s) => s.currentConvId);
  const conversations = useChatStore((s) => s.conversations);
  const theme = useChatStore((s) => s.theme);
  const toggleTheme = useChatStore((s) => s.toggleTheme);
  const isLoading = useChatStore((s) => s.isLoading);
  const cancelStream = useChatStore((s) => s.cancelStream);

  const title = conversations.find((c) => c.id === currentConvId)?.title ?? '獬小图智慧咨询';

  return (
    <div
      className="flex items-center justify-between px-4 py-2 shrink-0 sticky top-0 z-10"
      style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-surface)' }}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          <Menu className="size-5" />
        </button>
        <img src="/logo.png" alt="logo" className="h-7 w-auto hidden lg:block" />
        <span className="font-semibold">{title}</span>
      </div>
      <div className="flex items-center gap-1">
        {isLoading && (
          <button
            onClick={cancelStream}
            className="p-2 rounded-lg transition-colors"
            style={{ color: 'var(--color-error)' }}
            title="停止生成"
          >
            <Ban className="size-4" />
          </button>
        )}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-lg transition-colors"
          style={{ color: 'var(--color-text-secondary)' }}
        >
          {theme === 'light' ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </button>
      </div>
    </div>
  );
}
