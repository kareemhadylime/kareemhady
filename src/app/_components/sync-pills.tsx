import { RefreshCcw, AlertTriangle } from 'lucide-react';
import type { SyncFreshness } from '@/lib/sync-freshness';

// Small inline pill strip — shown in dashboard headers so staleness is
// always visible. Colors: green fresh, amber stale, red very_stale, grey
// never.

export function SyncPills({ pills }: { pills: SyncFreshness[] }) {
  if (!pills || pills.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 text-[10px]">
      {pills.map(p => {
        const color =
          p.status === 'fresh'
            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
            : p.status === 'stale'
              ? 'bg-amber-50 text-amber-700 border-amber-200'
              : p.status === 'very_stale'
                ? 'bg-rose-50 text-rose-700 border-rose-200'
                : 'bg-slate-50 text-slate-500 border-slate-200';
        const Icon =
          p.status === 'fresh' || p.status === 'never' ? RefreshCcw : AlertTriangle;
        return (
          <span
            key={p.source}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border font-medium ${color}`}
            title={p.last_synced_at || 'never synced'}
          >
            <Icon size={10} />
            <span className="font-semibold">{p.source}</span>
            <span className="opacity-75">· {p.label}</span>
          </span>
        );
      })}
    </div>
  );
}
