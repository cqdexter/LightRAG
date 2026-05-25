import Header from './Header';
import MessageList from './MessageList';
import InputArea from './InputArea';

interface Props {
  onToggleSidebar: () => void;
}

export default function ChatArea({ onToggleSidebar }: Props) {
  return (
    <div className="flex-1 flex flex-col min-w-0" style={{ background: 'var(--color-bg)' }}>
      <Header onToggleSidebar={onToggleSidebar} />
      <MessageList />
      <InputArea />
    </div>
  );
}
