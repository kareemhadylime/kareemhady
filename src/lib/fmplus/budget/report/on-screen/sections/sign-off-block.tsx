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

const ROLE_LABELS: Record<string, string> = {
  project_manager: 'Project Manager',
  finance_director: 'Finance Director',
  fmplus_signatory: 'FMPlus Authorized Signatory',
  customer_signatory: 'Customer Authorized Signatory',
};

export function SignOffBlock({ data }: { data: ReportData }) {
  const { lang } = data.meta;
  const { lines, history } = data.signoff;

  if (lines.length === 0 && history.length === 0) return null;

  return (
    <section className="ix-card p-5 space-y-5">
      <h2 className="text-sm font-semibold font-serif text-slate-900 dark:text-slate-100">Sign-Off</h2>

      {/* Signature lines */}
      {lines.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {lines.map((line, i) => (
            <div key={i} className="space-y-3">
              <div className="border-b border-slate-300 dark:border-slate-600 pb-1 h-10" />
              <div className="text-xs text-slate-900 dark:text-slate-100 font-medium">
                <LangLabel en={line.placeholder_en} ar={line.placeholder_ar} lang={lang} />
              </div>
              <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {ROLE_LABELS[line.role] ?? line.role}
              </div>
              <div className="text-[10px] text-slate-400 dark:text-slate-500">
                Date: ____________________
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Sign-off history */}
      {history.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Sign-off History</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 uppercase text-[10px] tracking-wide">
                  <th className="pb-2 pr-3">Role</th>
                  <th className="pb-2 pr-3">Mode</th>
                  <th className="pb-2 pr-3">Signed At</th>
                  <th className="pb-2">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {history.map((h) => (
                  <tr key={h.id} className="text-slate-900 dark:text-slate-100">
                    <td className="py-1.5 pr-3 capitalize">{ROLE_LABELS[h.signed_role] ?? h.signed_role}</td>
                    <td className="py-1.5 pr-3 capitalize">{h.mode}</td>
                    <td className="py-1.5 pr-3 tabular-nums text-slate-500 dark:text-slate-400">
                      {h.signed_at ? new Date(h.signed_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                    </td>
                    <td className="py-1.5 text-slate-500 dark:text-slate-400">{h.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
