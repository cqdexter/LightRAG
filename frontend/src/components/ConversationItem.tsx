import { Trash2 } from 'lucide-react';
import type { Conversation } from '../types';

interface Props {
  conversation: Conversation;
  isActive: boolean;
  onSelect: () => void;
  onDelete: () => void;
}

export default function ConversationItem({ conversation, isActive, onSelect, onDelete }: Props) {
  return (
    <div
      onClick={onSelect}
      className="group flex items-center justify-between px-3 py-2 mx-2 rounded-lg cursor-pointer transition-colors"
      style={{
        background: isActive ? 'var(--color-border)' : 'transparent',
        color: 'var(--color-text)',
      }}
      onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.background = 'var(--color-border)'; }}
      onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{conversation.title}</div>
        <div className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          {new Date(conversation.updatedAt).toLocaleDateString('zh-CN')}
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(); }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity"
        style={{ color: 'var(--color-text-secondary)' }}
      >
        <Trash2 className="size-4" />
      </button>
    </div>
  );
}
