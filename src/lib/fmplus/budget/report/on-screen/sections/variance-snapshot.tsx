import type { ReportData } from '../../types';

function fmtEGP(n: number) {
  return (n / 1_000_000).toFixed(2) + ' M EGP';
}

function varianceColor(pct: number) {
  if (Math.abs(pct) <= 5) return 'text-green-500';
  if (Math.abs(pct) <= 15) return 'text-amber-500';
  return 'text-red-500';
}

function KpiTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-body">{label}</div>
      <div className={`text-xl font-bold tabular-nums mt-1 font-serif ${color ?? 'text-slate-900 dark:text-slate-100'}`}>{value}</div>
    </div>
  );
}

export function VarianceSnapshot({ data }: { data: ReportData }) {
  if (!data.variance_snapshot) return null;

  const { ytd_budget, ytd_actual, variance_pct } = data.variance_snapshot;
  const varianceEGP = ytd_actual - ytd_budget;

  return (
    <section className="ix-card p-5 space-y-3">
      <h2 className="text-sm font-semibold font-serif text-slate-900 dark:text-slate-100">Variance Snapshot (YTD)</h2>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiTile label="YTD Budget" value={fmtEGP(ytd_budget)} />
        <KpiTile label="YTD Actual" value={fmtEGP(ytd_actual)} />
        <KpiTile
          label="Variance"
          value={(varianceEGP >= 0 ? '+' : '') + fmtEGP(varianceEGP)}
          color={varianceColor(variance_pct)}
        />
        <KpiTile
          label="Variance %"
          value={(variance_pct >= 0 ? '+' : '') + variance_pct.toFixed(1) + '%'}
          color={varianceColor(variance_pct)}
        />
      </div>
    </section>
  );
}
