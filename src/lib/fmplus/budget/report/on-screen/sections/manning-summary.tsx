import type { ReportData, ReportLang } from '../../types';

function LangLabel({ en, ar, lang }: { en: string; ar?: string | null; lang: ReportLang }) {
  if (lang === 'ar') return <span dir="rtl">{ar ?? en}</span>;
  if (lang === 'both' && ar) {
    return (
      <>
        <span>{en}</span>
        <br />
        <span className="text-[10px] text-slate-400 dark:text-slate-500" dir="rtl">{ar}</span>
      </>
    );
  }
  return <span>{en}</span>;
}

function fmtEGP(n: number | null) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-EG', { maximumFractionDigits: 0 }).format(n);
}

const SL_LABELS: Record<string, string> = {
  hk: 'Housekeeping', mep: 'MEP', landscape: 'Landscape',
  security: 'Security', pest_ctrl: 'Pest Control', waste_mgmt: 'Waste Mgmt', back_office: 'Back Office',
};

export function ManningSummary({ data }: { data: ReportData }) {
  const { mode, lang } = data.meta;
  const isCustomer = mode === 'customer';

  // Group rows by service_line then sub_section
  const grouped = new Map<string, Map<string | null, typeof data.manning.rows>>();
  for (const row of data.manning.rows) {
    if (!grouped.has(row.service_line)) grouped.set(row.service_line, new Map());
    const slMap = grouped.get(row.service_line)!;
    if (!slMap.has(row.sub_section)) slMap.set(row.sub_section, []);
    slMap.get(row.sub_section)!.push(row);
  }

  if (data.manning.rows.length === 0) {
    return (
      <section className="ix-card p-5">
        <h2 className="text-sm font-semibold font-serif text-slate-900 dark:text-slate-100 mb-2">Manning Detail</h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 italic">No manning lines added yet.</p>
      </section>
    );
  }

  return (
    <section className="ix-card p-5 space-y-4">
      <h2 className="text-sm font-semibold font-serif text-slate-900 dark:text-slate-100">Manning Detail</h2>

      {[...grouped.entries()].map(([sl, subsections]) => (
        <div key={sl} className="space-y-1">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-fmplus-gold dark:text-fmplus-yellow font-body">
            {SL_LABELS[sl] ?? sl}
          </h3>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wide">
                  <th className="pb-1.5 pr-3">Position</th>
                  {[...subsections.keys()].some(k => k != null) && <th className="pb-1.5 pr-3">Sub-section</th>}
                  <th className="pb-1.5 pr-3 text-right">HC Req.</th>
                  {!isCustomer && <th className="pb-1.5 pr-3 text-right">HC Bud.</th>}
                  {!isCustomer && <th className="pb-1.5 pr-3 text-right">CTC Rate</th>}
                  {!isCustomer && <th className="pb-1.5 text-right">Monthly Cost</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {[...subsections.entries()].flatMap(([sub, rows]) =>
                  rows.map((row, i) => (
                    <tr key={`${sub}-${i}`} className="text-slate-900 dark:text-slate-100">
                      <td className="py-1.5 pr-3">
                        <LangLabel en={row.position_label_en} ar={row.position_label_ar} lang={lang} />
                      </td>
                      {[...subsections.keys()].some(k => k != null) && (
                        <td className="py-1.5 pr-3 text-slate-500 dark:text-slate-400">
                          {i === 0 ? (sub ?? '—') : ''}
                        </td>
                      )}
                      <td className="py-1.5 pr-3 text-right tabular-nums">{row.hc_required}</td>
                      {!isCustomer && <td className="py-1.5 pr-3 text-right tabular-nums">{row.hc_budgeted ?? '—'}</td>}
                      {!isCustomer && <td className="py-1.5 pr-3 text-right tabular-nums">{fmtEGP(row.ctc_rate)}</td>}
                      {!isCustomer && <td className="py-1.5 text-right tabular-nums">{fmtEGP(row.monthly_cost)}</td>}
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                {(() => {
                  const slTotals = data.manning.totals_by_service[sl as keyof typeof data.manning.totals_by_service];
                  if (!slTotals) return null;
                  return (
                    <tr className="border-t border-slate-200 dark:border-slate-700 font-semibold text-slate-900 dark:text-slate-100">
                      <td className="pt-1.5 pr-3 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Subtotal</td>
                      {[...subsections.keys()].some(k => k != null) && <td />}
                      <td className="pt-1.5 pr-3 text-right tabular-nums">{slTotals.hc_required}</td>
                      {!isCustomer && <td className="pt-1.5 pr-3 text-right tabular-nums">{slTotals.hc_budgeted ?? '—'}</td>}
                      {!isCustomer && <td />}
                      {!isCustomer && <td />}
                    </tr>
                  );
                })()}
              </tfoot>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}
