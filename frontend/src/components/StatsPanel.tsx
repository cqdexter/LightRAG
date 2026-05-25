import { useEffect, useState } from 'react';
import { FileText, Box, Cpu, Radio } from 'lucide-react';
import { useChatStore } from '../store/chatStore';

interface Stats {
  documents: number;
  entities: number;
  llmModel: string;
  queryMode: string;
}

export default function StatsPanel() {
  const baseUrl = useChatStore((s) => s.settings.baseUrl);
  const mode = useChatStore((s) => s.settings.mode);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    if (!baseUrl) return;

    Promise.allSettled([
      fetch(`${baseUrl}/documents/status_counts`).then((r) => r.json()),
      fetch(`${baseUrl}/graph/label/list`).then((r) => r.json()),
      fetch(`${baseUrl}/health`).then((r) => r.json()),
    ]).then(([docRes, entityRes, healthRes]) => {
      const docs = docRes.status === 'fulfilled' ? docRes.value.status_counts?.processed ?? 0 : 0;
      const entities = entityRes.status === 'fulfilled' ? entityRes.value.length ?? 0 : 0;
      const llmModel =
        healthRes.status === 'fulfilled' ? healthRes.value.configuration?.llm_model ?? '-' : '-';

      setStats({ documents: docs, entities, llmModel, queryMode: mode });
    });
  }, [baseUrl, mode]);

  if (!stats) return null;

  return (
    <div className="px-4 py-3 space-y-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
      {/* Top row: 2-column layout for docs + entities */}
      <div className="grid grid-cols-2 gap-2">
        <StatCard icon={FileText} label="文档" value={stats.documents} />
        <StatCard icon={Box} label="实体" value={stats.entities} />
      </div>
      {/* Full-width rows for model + mode */}
      <StatCard icon={Cpu} label="对话模型" value={stats.llmModel} />
      <StatCard icon={Radio} label="检索模式" value={stats.queryMode} />
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-lg px-2.5 py-2"
      style={{ background: 'var(--color-bg)' }}
    >
      <Icon className="size-3.5 shrink-0 opacity-60" />
      <div className="min-w-0 leading-tight">
        <div className="text-[10px] opacity-60">{label}</div>
        <div className="text-xs font-medium truncate">{value}</div>
      </div>
    </div>
  );
}
