import type { ToplineKpi } from './types';
import { chipArrow } from './comparisons';

// Owner-readable English digest. Single sentence at the top of the report
// that the recipient can read in 5 seconds and know whether yesterday was
// good, soft, or boring.
//
// Format:
//   "Sunday: EGP 48,200 net (▲ +12% wk). 24 orders · AOV EGP 2,008 · 31 units."

const fmtEgp = (n: number): string => {
  if (Math.abs(n) >= 1_000_000) return `EGP ${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1000) return `EGP ${Math.round(n / 1000)}k`;
  return `EGP ${Math.round(n).toLocaleString('en-US')}`;
};

export function composeOneliner(args: {
  weekday: string;
  topline: ToplineKpi;
}): string {
  const t = args.topline;
  const wkChip = t.comparisons.net_revenue.vs_prior_weekday;
  const wkArrow = chipArrow(wkChip);
  const wkPct =
    wkChip && wkChip.pct !== null
      ? ` (${wkArrow} ${wkChip.pct > 0 ? '+' : ''}${wkChip.pct.toFixed(0)}% wk)`
      : '';
  const aovStr =
    t.aov_egp != null ? ` · AOV ${fmtEgp(t.aov_egp)}` : '';
  return (
    `${args.weekday}: ${fmtEgp(t.net_revenue_egp)} net${wkPct}. ` +
    `${t.orders} orders${aovStr} · ${t.units} units. ` +
    (t.unique_customers > 0
      ? `${t.new_customers} new · ${t.returning_customers} returning customers.`
      : '')
  ).trim();
}
