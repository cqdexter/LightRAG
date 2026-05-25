import { Search } from 'lucide-react';

interface Props { value: string; onChange: (v: string) => void; }

export default function SearchBar({ value, onChange }: Props) {
  return (
    <div className="relative px-3 py-2">
      <Search className="absolute left-6 top-1/2 -translate-y-1/2 size-4" style={{ color: 'var(--color-text-secondary)' }} />
      <input
        type="text"
        placeholder="搜索对话..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border bg-transparent py-1.5 pl-8 pr-3 text-sm outline-none"
        style={{
          borderColor: 'var(--color-border)',
          color: 'var(--color-text)',
        }}
      />
    </div>
  );
}
