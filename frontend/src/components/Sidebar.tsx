import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import SearchBar from './SearchBar';
import ConversationList from './ConversationList';
import StatsPanel from './StatsPanel';
import { useChatStore } from '../store/chatStore';

interface Props { mobile?: boolean; onClose?: () => void; }

export default function Sidebar({ mobile, onClose }: Props) {
  const [search, setSearch] = useState('');
  const newConversation = useChatStore((s) => s.newConversation);
  const switchConversation = useChatStore((s) => s.switchConversation);

  const handleNew = () => {
    const id = newConversation();
    switchConversation(id);
    if (mobile && onClose) onClose();
  };

  return (
    <div
      className="h-full flex flex-col"
      style={{ background: 'var(--color-surface)', borderRight: mobile ? 'none' : '1px solid var(--color-border)' }}
    >
      <div className="relative flex flex-col items-center gap-1 px-4 py-3" style={{ borderBottom: '1px solid var(--color-border)' }}>
        {mobile && (
          <button onClick={onClose} className="absolute right-3 top-3" style={{ color: 'var(--color-text-secondary)' }}>
            <X className="size-5" />
          </button>
        )}
        <img src="/logo.png" alt="logo" className="h-8 w-auto" />
        <span className="font-semibold text-sm">獬小图智慧咨询</span>
      </div>
      <StatsPanel />
      <SearchBar value={search} onChange={setSearch} />
      <ConversationList filter={search} onClose={mobile ? onClose : undefined} />
      <div className="p-3">
        <button
          onClick={handleNew}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: 'var(--color-primary)', color: '#fff' }}
        >
          <Plus className="size-4" /> 新建对话
        </button>
      </div>
    </div>
  );
}
