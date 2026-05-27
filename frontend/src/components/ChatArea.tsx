import { useState } from 'react';
import Header from './Header';
import MessageList from './MessageList';
import InputArea from './InputArea';
import SettingsModal from './SettingsModal';

interface Props {
  onToggleSidebar: () => void;
}

export default function ChatArea({ onToggleSidebar }: Props) {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex-1 flex flex-col min-w-0" style={{ background: 'var(--color-bg)' }}>
      <Header onToggleSidebar={onToggleSidebar} onOpenSettings={() => setSettingsOpen(true)} />
      <MessageList />
      <InputArea />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
