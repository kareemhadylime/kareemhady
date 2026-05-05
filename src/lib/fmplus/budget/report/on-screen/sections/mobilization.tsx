import type { ReportData, ReportLang } from '../../types';

function fmtEGP(n: number) {
  return new Intl.NumberFormat('en-EG', { maximumFractionDigits: 0 }).format(n);
}

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

const CAT_LABELS: Record<string, string> = {
  capex: 'CapEx',
  opex_one_time: 'OpEx One-Time',
  training: 'Training',
  recruitment: 'Recruitment',
};

export function Mobilization({ data }: { data: ReportData }) {
  if (!data.mobilization) return null;

  const { lang } = data.meta;
  const mob = data.mobilization;

  // Customer mode: summary card
  if ('summary_text' in mob) {
    return (
      <section className="ix-card p-5 space-y-3">
        <h2 className="text-sm font-semibold font-serif text-slate-900 dark:text-slate-100">Mobilization</h2>
        <div className="bg-fmplus-yellow/8 dark:bg-fmplus-gold/10 border border-fmplus-gold/30 rounded-lg p-4 flex items-center justify-between">
          <span className="text-sm text-slate-700 dark:text-slate-300 font-body">{mob.summary_text}</span>
          <span className="text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100 ml-4">{fmtEGP(mob.total_egp)} EGP</span>
        </div>
      </section>
    );
  }

  // Internal mode: detail table
  const total = mob.detail.reduce((s, l) => s + l.total, 0);

  return (
    <section className="ix-card p-5 space-y-3">
      <h2 className="text-sm font-semibold font-serif text-slate-900 dark:text-slate-100">Mobilization</h2>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wide">
              <th className="pb-2 pr-3">Category</th>
              <th className="pb-2 pr-3">Item</th>
              <th className="pb-2 pr-3 text-right">Qty</th>
              <th className="pb-2 pr-3 text-right">Unit Cost</th>
              <th className="pb-2 pr-3 text-right">Total</th>
              <th className="pb-2 text-right">Amort. (mo)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {mob.detail.map((line, i) => (
              <tr key={i} className="text-slate-900 dark:text-slate-100">
                <td className="py-1.5 pr-3 text-slate-500 dark:text-slate-400">{CAT_LABELS[line.category] ?? line.category}</td>
                <td className="py-1.5 pr-3">
                  <LangLabel en={line.label_en} ar={line.label_ar} lang={lang} />
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{line.qty}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{fmtEGP(line.unit_cost)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{fmtEGP(line.total)}</td>
                <td className="py-1.5 text-right tabular-nums text-slate-500 dark:text-slate-400">{line.amortization_months}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 dark:border-slate-600 font-semibold text-slate-900 dark:text-slate-100">
              <td className="pt-2 pr-3 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400" colSpan={4}>Total Mobilization</td>
              <td className="pt-2 pr-3 text-right tabular-nums text-fmplus-gold dark:text-fmplus-yellow">{fmtEGP(total)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
