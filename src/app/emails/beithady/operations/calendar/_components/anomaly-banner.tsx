import { AlertTriangle } from 'lucide-react';
import type { AnomalySnapshot } from '@/lib/beithady/operations/types';

export function AnomalyBanner({ anomalies }: { anomalies: AnomalySnapshot }) {
  const issues: string[] = [];
  if (anomalies.unpaid_count > 0) {
    const balance = anomalies.unpaid_balance_cents
      ? ` ($${(anomalies.unpaid_balance_cents / 100).toLocaleString()})`
      : '';
    issues.push(`${anomalies.unpaid_count} unpaid in next 7 days${balance}`);
  }
  if (anomalies.prearrival_missing_count > 0) {
    issues.push(`${anomalies.prearrival_missing_count} pre-arrival message pending`);
  }
  if (anomalies.cleaning_gap_count > 0) {
    issues.push(`${anomalies.cleaning_gap_count} cleaning gap${anomalies.cleaning_gap_count === 1 ? '' : 's'} (<3 hr)`);
  }
  if (issues.length === 0) return null;
  return (
    <div className="ix-card border-l-4 border-amber-500 bg-amber-50/60 dark:bg-amber-900/10 p-3 flex items-center gap-2">
      <AlertTriangle size={16} className="text-amber-600 shrink-0" />
      <div className="text-xs text-amber-900 dark:text-amber-200">
        <span className="font-semibold mr-1">Heads up:</span>
        {issues.join(' · ')}
      </div>
    </div>
  );
}
