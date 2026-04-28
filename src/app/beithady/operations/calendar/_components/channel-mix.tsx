import type { CalendarReservation } from '@/lib/beithady/operations/types';
import { channelMeta } from '@/lib/beithady/operations/channel-meta';

// Inline horizontal bar showing the channel split for the visible
// window. Rendered server-side (no chart lib needed).
export function ChannelMix({ reservations }: { reservations: CalendarReservation[] }) {
  const counts = new Map<string, number>();
  for (const r of reservations) {
    if (r.status === 'canceled') continue;
    const k = r.channel || 'unknown';
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const total = Array.from(counts.values()).reduce((s, v) => s + v, 0);
  if (total === 0) return null;
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);

  return (
    <div className="ix-card p-2.5 space-y-1.5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 flex items-center gap-2">
        Channel mix · {total} active
      </div>
      <div className="h-2 rounded overflow-hidden flex bg-slate-100 dark:bg-slate-800">
        {sorted.map(([ch, n]) => {
          const meta = channelMeta(ch);
          const pct = (n / total) * 100;
          return (
            <div
              key={ch}
              style={{ width: `${pct}%`, background: meta.color }}
              title={`${meta.label}: ${n} (${pct.toFixed(1)}%)`}
              aria-label={`${meta.label}: ${n}`}
            />
          );
        })}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-600 dark:text-slate-400">
        {sorted.map(([ch, n]) => {
          const meta = channelMeta(ch);
          const pct = (n / total) * 100;
          return (
            <span key={ch} className="inline-flex items-center gap-1">
              <span
                className="inline-block w-2 h-2 rounded-sm"
                style={{ background: meta.color }}
              />
              {meta.label} <span className="tabular-nums">{n}</span>
              <span className="text-slate-400">({pct.toFixed(0)}%)</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}
