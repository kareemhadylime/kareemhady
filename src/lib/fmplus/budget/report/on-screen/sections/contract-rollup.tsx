import type { ReportData } from '../../types';

function fmtEGP(n: number) {
  return (n / 1_000_000).toFixed(2) + ' M';
}

function fmtPct(n: number) {
  return n.toFixed(1) + '%';
}

function gpColor(pct: number) {
  if (pct >= 20) return 'text-green-500';
  if (pct >= 10) return 'text-amber-500';
  return 'text-red-500';
}

export function ContractRollup({ data }: { data: ReportData }) {
  if (!data.contract_rollup) return null;

  const { years, total_cost, total_revenue } = data.contract_rollup;
  const totalGp = total_revenue - total_cost;
  const totalGpPct = total_revenue > 0 ? ((totalGp / total_revenue) * 100) : 0;
  const { mode } = data.meta;
  const isCustomer = mode === 'customer';

  return (
    <section className="ix-card p-5 space-y-3">
      <h2 className="text-sm font-semibold font-serif text-slate-900 dark:text-slate-100">Contract Rollup (Multi-Year)</h2>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wide">
              <th className="pb-2 pr-3">Year</th>
              <th className="pb-2 pr-3">Scenario</th>
              {!isCustomer && <th className="pb-2 pr-3 text-right">Total Cost</th>}
              <th className="pb-2 pr-3 text-right">Revenue</th>
              {!isCustomer && <th className="pb-2 pr-3 text-right">GP (EGP)</th>}
              {!isCustomer && <th className="pb-2 text-right">GP %</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {years.map((y) => (
              <tr key={y.year_index} className="text-slate-900 dark:text-slate-100">
                <td className="py-1.5 pr-3 font-medium">
                  Y{y.year_index}
                  {y.fiscal_year ? <span className="text-slate-400 dark:text-slate-500 ml-1 text-[10px]">FY{y.fiscal_year}</span> : null}
                </td>
                <td className="py-1.5 pr-3 text-slate-500 dark:text-slate-400 capitalize">{y.scenario}</td>
                {!isCustomer && <td className="py-1.5 pr-3 text-right tabular-nums">{fmtEGP(y.total_cost)} M</td>}
                <td className="py-1.5 pr-3 text-right tabular-nums">{fmtEGP(y.total_revenue)} M</td>
                {!isCustomer && <td className="py-1.5 pr-3 text-right tabular-nums">{fmtEGP(y.gp_egp)} M</td>}
                {!isCustomer && (
                  <td className={`py-1.5 text-right tabular-nums font-semibold ${gpColor(y.gp_pct)}`}>
                    {fmtPct(y.gp_pct)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 dark:border-slate-600 font-semibold text-slate-900 dark:text-slate-100">
              <td className="pt-2 pr-3 text-[10px] uppercase text-slate-500 dark:text-slate-400" colSpan={2}>Total</td>
              {!isCustomer && <td className="pt-2 pr-3 text-right tabular-nums">{fmtEGP(total_cost)} M</td>}
              <td className="pt-2 pr-3 text-right tabular-nums">{fmtEGP(total_revenue)} M</td>
              {!isCustomer && <td className="pt-2 pr-3 text-right tabular-nums">{fmtEGP(totalGp)} M</td>}
              {!isCustomer && (
                <td className={`pt-2 text-right tabular-nums ${gpColor(totalGpPct)}`}>
                  {fmtPct(totalGpPct)}
                </td>
              )}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
