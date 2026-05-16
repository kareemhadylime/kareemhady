import { AlertTriangle } from 'lucide-react';
import { detectAnomalies, type AnomalyEvent } from '@/lib/beithady/ads/anomalies';

function tintFor(severity: AnomalyEvent['severity']): string {
  return severity === 'critical'
    ? 'border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
    : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300';
}

export async function AnomalyBanner() {
  const events = await detectAnomalies();
  if (events.length === 0) return null;
  return (
    <div className="space-y-2">
      {events.map((e, i) => (
        <div key={`${e.type}|${e.platform}|${i}`}
             className={`ix-card p-3 text-xs flex items-center gap-2 border ${tintFor(e.severity)}`}>
          <AlertTriangle size={14} className="shrink-0" />
          <span>{e.message}</span>
        </div>
      ))}
    </div>
  );
}
