import { useState, useEffect } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import { useChatStore } from './store/chatStore';

export default function App() {
  const [mobileSidebar, setMobileSidebar] = useState(false);
  const theme = useChatStore((s) => s.theme);
  const sidebarOpen = useChatStore((s) => s.sidebarOpen);
  const setSidebarOpen = useChatStore((s) => s.setSidebarOpen);
  const initializeFromServer = useChatStore((s) => s.initializeFromServer);
  const isInitialized = useChatStore((s) => s.isInitialized);

  useEffect(() => {
    initializeFromServer();
  }, [initializeFromServer]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  if (!isInitialized) {
    return (
      <div className="h-screen flex items-center justify-center" style={{ background: 'var(--color-bg)', color: 'var(--color-text-secondary)' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="size-6 rounded-full border-2 border-current border-t-transparent animate-spin" />
          <span className="text-sm">加载中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: 'var(--color-bg)' }}>
      {/* Desktop sidebar */}
      <div className={`hidden lg:flex ${sidebarOpen ? 'w-[260px]' : 'w-0'} transition-all overflow-hidden`}>
        <Sidebar />
      </div>

      {/* Mobile sidebar drawer */}
      {mobileSidebar && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setMobileSidebar(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-[280px]">
            <Sidebar mobile onClose={() => setMobileSidebar(false)} />
          </div>
        </div>
      )}

      <ChatArea
        onToggleSidebar={() => {
          if (window.innerWidth < 1024) setMobileSidebar(true);
          else toggleSidebar();
        }}
      />
    </div>
  );
}
