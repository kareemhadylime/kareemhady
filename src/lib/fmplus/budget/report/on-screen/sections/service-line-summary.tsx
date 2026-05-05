import type { ReportData } from '../../types';

function fmtEGP(n: number) {
  return new Intl.NumberFormat('en-EG', { maximumFractionDigits: 0 }).format(n);
}

function fmtPct(n: number | null) {
  return n == null ? '—' : n.toFixed(1) + '%';
}

const SL_LABELS: Record<string, string> = {
  hk: 'Housekeeping',
  mep: 'MEP',
  landscape: 'Landscape',
  security: 'Security',
  pest_ctrl: 'Pest Control',
  waste_mgmt: 'Waste Mgmt',
  back_office: 'Back Office',
};

export function ServiceLineSummary({ data }: { data: ReportData }) {
  const { mode } = data.meta;
  const isCustomer = mode === 'customer';

  const totals = data.service_lines.reduce(
    (acc, s) => ({
      hc_required: acc.hc_required + s.hc_required,
      hc_budgeted: acc.hc_budgeted != null && s.hc_budgeted != null ? acc.hc_budgeted + s.hc_budgeted : null,
      monthly_cost: acc.monthly_cost != null && s.monthly_cost != null ? acc.monthly_cost + s.monthly_cost : null,
      monthly_fee: acc.monthly_fee + s.monthly_fee,
      annual_ex_vat: acc.annual_ex_vat + s.annual_ex_vat,
      annual_incl_vat: acc.annual_incl_vat + s.annual_incl_vat,
    }),
    { hc_required: 0, hc_budgeted: 0 as number | null, monthly_cost: 0 as number | null, monthly_fee: 0, annual_ex_vat: 0, annual_incl_vat: 0 },
  );

  return (
    <section className="ix-card p-5 space-y-3">
      <h2 className="text-sm font-semibold font-serif text-slate-900 dark:text-slate-100">Service Line Summary</h2>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wide">
              <th className="pb-2 pr-3">Service Line</th>
              <th className="pb-2 pr-3 text-right">HC Required</th>
              {!isCustomer && <th className="pb-2 pr-3 text-right">HC Budgeted</th>}
              {!isCustomer && <th className="pb-2 pr-3 text-right">Monthly Cost</th>}
              <th className="pb-2 pr-3 text-right">Monthly Fee</th>
              <th className="pb-2 pr-3 text-right">Annual Ex VAT</th>
              <th className="pb-2 text-right">Annual Incl VAT</th>
              {!isCustomer && <th className="pb-2 pl-3 text-right">GP %</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.service_lines.map((s) => (
              <tr key={s.service_line} className="text-slate-900 dark:text-slate-100">
                <td className="py-2 pr-3 font-medium">{SL_LABELS[s.service_line] ?? s.service_line}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{s.hc_required}</td>
                {!isCustomer && <td className="py-2 pr-3 text-right tabular-nums">{s.hc_budgeted ?? '—'}</td>}
                {!isCustomer && (
                  <td className="py-2 pr-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                    {s.monthly_cost != null ? fmtEGP(s.monthly_cost) : '—'}
                  </td>
                )}
                <td className="py-2 pr-3 text-right tabular-nums">{fmtEGP(s.monthly_fee)}</td>
                <td className="py-2 pr-3 text-right tabular-nums">{fmtEGP(s.annual_ex_vat)}</td>
                <td className="py-2 text-right tabular-nums">{fmtEGP(s.annual_incl_vat)}</td>
                {!isCustomer && (
                  <td className={`py-2 pl-3 text-right tabular-nums font-semibold ${
                    s.gp_pct == null ? 'text-slate-400' :
                    s.gp_pct >= 20 ? 'text-green-500' :
                    s.gp_pct >= 10 ? 'text-amber-500' : 'text-red-500'
                  }`}>
                    {fmtPct(s.gp_pct)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 dark:border-slate-600 font-semibold text-slate-900 dark:text-slate-100">
              <td className="pt-2 pr-3">Total</td>
              <td className="pt-2 pr-3 text-right tabular-nums">{totals.hc_required}</td>
              {!isCustomer && <td className="pt-2 pr-3 text-right tabular-nums">{totals.hc_budgeted ?? '—'}</td>}
              {!isCustomer && (
                <td className="pt-2 pr-3 text-right tabular-nums">
                  {totals.monthly_cost != null ? fmtEGP(totals.monthly_cost) : '—'}
                </td>
              )}
              <td className="pt-2 pr-3 text-right tabular-nums">{fmtEGP(totals.monthly_fee)}</td>
              <td className="pt-2 pr-3 text-right tabular-nums">{fmtEGP(totals.annual_ex_vat)}</td>
              <td className="pt-2 text-right tabular-nums">{fmtEGP(totals.annual_incl_vat)}</td>
              {!isCustomer && <td className="pt-2 pl-3" />}
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
