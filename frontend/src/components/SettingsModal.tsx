import { useState } from 'react';
import { X } from 'lucide-react';
import { useChatStore } from '../store/chatStore';

interface Props { open: boolean; onClose: () => void; }

const MODES = ['mix', 'local', 'global', 'hybrid', 'naive', 'bypass'];

export default function SettingsModal({ open, onClose }: Props) {
  const settings = useChatStore((s) => s.settings);
  const updateSettings = useChatStore((s) => s.updateSettings);
  const [form, setForm] = useState({ ...settings });

  if (!open) return null;

  const handleSave = () => {
    updateSettings(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="rounded-xl p-6 w-full max-w-md shadow-xl" style={{ background: 'var(--color-surface)' }}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">设置</h2>
          <button onClick={onClose} style={{ color: 'var(--color-text-secondary)' }}><X className="size-5" /></button>
        </div>
        <div className="space-y-3">
          {([
            { label: 'API 地址', key: 'baseUrl' as const, type: 'text', placeholder: 'http://your-server:9621' },
            { label: 'API Key', key: 'apiKey' as const, type: 'password', placeholder: '可选' },
          ]).map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label className="block text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>{label}</label>
              <input
                type={type}
                placeholder={placeholder}
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors"
                style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
              />
            </div>
          ))}
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>查询模式</label>
            <select
              value={form.mode}
              onChange={(e) => setForm({ ...form, mode: e.target.value })}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
            >
              {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-secondary)' }}>Top K</label>
            <input
              type="number"
              value={form.topK}
              onChange={(e) => setForm({ ...form, topK: parseInt(e.target.value) || 60 })}
              min={1} max={100}
              className="w-full rounded-lg border px-3 py-2 text-sm outline-none"
              style={{ borderColor: 'var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-text)' }}
            />
          </div>
        </div>
        <button
          onClick={handleSave}
          className="w-full mt-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: 'var(--color-primary)', color: '#fff' }}
        >保存</button>
      </div>
    </div>
  );
}
