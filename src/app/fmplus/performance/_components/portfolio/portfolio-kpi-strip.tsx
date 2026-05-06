import type { PortfolioPerformancePayload } from '@/lib/fmplus/performance/types';
export function PortfolioKpiStrip({ totals }: { totals: PortfolioPerformancePayload['totals'] }) {
  const tiles = [
    { label: 'Total Revenue', value: `${(totals.revenue / 1e6).toFixed(2)}M`, sub: 'EGP' },
    { label: 'Total Expense', value: `${(totals.expense / 1e6).toFixed(2)}M`, sub: 'EGP' },
    { label: 'Blended GP %', value: `${(totals.blended_gp_pct * 100).toFixed(1)}%`, sub: '' },
    { label: 'Portfolio Variance %', value: `${(totals.portfolio_variance_pct * 100).toFixed(1)}%`, sub: '' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {tiles.map(t => (
        <div key={t.label} className="ix-card p-4">
          <p className="text-[10px] uppercase tracking-wide text-fmplus-gold font-semibold">{t.label}</p>
          <p className="text-2xl font-bold tabular-nums mt-1 text-fmplus-yellow font-serif">{t.value}</p>
          {t.sub && <p className="text-xs text-slate-400 mt-0.5">{t.sub}</p>}
        </div>
      ))}
    </div>
  );
}
