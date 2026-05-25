import ConversationItem from './ConversationItem';
import { useChatStore } from '../store/chatStore';

interface Props { filter?: string; onClose?: () => void; }

export default function ConversationList({ filter, onClose }: Props) {
  const conversations = useChatStore((s) => s.conversations);
  const filtered = filter
    ? conversations.filter((c) => c.title.includes(filter))
    : conversations;
  const currentConvId = useChatStore((s) => s.currentConvId);
  const switchConversation = useChatStore((s) => s.switchConversation);
  const deleteConversation = useChatStore((s) => s.deleteConversation);

  if (conversations.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        暂无对话记录
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--color-text-secondary)' }}>
        没有找到匹配的对话
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto space-y-0.5">
      {filtered.map((conv) => (
        <ConversationItem
          key={conv.id}
          conversation={conv}
          isActive={conv.id === currentConvId}
          onSelect={() => { switchConversation(conv.id); onClose?.(); }}
          onDelete={() => deleteConversation(conv.id)}
        />
      ))}
    </div>
  );
}
