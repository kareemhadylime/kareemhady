import type { PortfolioRow } from '@/lib/fmplus/budget/portfolio';

export function AnomalyBanner({ rows }: { rows: PortfolioRow[] }) {
  const flagged = rows
    .filter(r => r.variance_pct != null && Math.abs(r.variance_pct) > 15)
    .slice(0, 3);
  if (flagged.length === 0) return null;
  return (
    <div className="rounded border-l-4 border-rose-500 bg-rose-50 dark:bg-rose-900/20 p-3 text-sm">
      <strong className="text-rose-700 dark:text-rose-300">&#9888; Anomaly detector</strong>
      {' — '}
      {flagged.length} project{flagged.length === 1 ? '' : 's'} deviating &gt;15% from budget:&nbsp;
      {flagged.map((r, i) => (
        <span key={r.project_id}>
          <strong>{r.project_name}</strong>
          {' '}
          <span className={r.variance > 0 ? 'text-rose-700' : 'text-emerald-700'}>
            ({r.variance_pct! > 0 ? '+' : ''}{r.variance_pct!.toFixed(0)}%)
          </span>
          {i < flagged.length - 1 ? ', ' : ''}
        </span>
      ))}
    </div>
  );
}
