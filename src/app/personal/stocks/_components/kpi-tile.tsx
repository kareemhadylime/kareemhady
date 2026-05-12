export type KpiTone = 'neutral' | 'pos' | 'neg';

export function KpiTile({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: KpiTone;
}) {
  const color =
    tone === 'pos'
      ? 'text-emerald-700'
      : tone === 'neg'
        ? 'text-rose-700'
        : 'text-slate-900 dark:text-slate-100';
  return (
    <div className="ix-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label}
      </div>
      <div className={`text-xl font-semibold mt-1 ${color}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

export function fmtEgp(n: number, opts?: { compact?: boolean }): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (opts?.compact) {
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}k`;
  }
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
