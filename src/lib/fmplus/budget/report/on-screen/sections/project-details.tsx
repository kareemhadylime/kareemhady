import type { ReportData, ReportLang } from '../../types';

function LangLabel({ en, ar, lang }: { en: string; ar?: string | null; lang: ReportLang }) {
  if (lang === 'ar') return <span dir="rtl">{ar ?? en}</span>;
  if (lang === 'both' && ar) {
    return (
      <>
        <span>{en}</span>
        <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-1" dir="rtl">{ar}</span>
      </>
    );
  }
  return <span>{en}</span>;
}

export function ProjectDetails({ data }: { data: ReportData }) {
  const { contract, lang } = data.meta;
  const { customer_contacts, zones, scope_summary } = data.project_details;

  // Sort contacts: primary first
  const sortedContacts = [...customer_contacts].sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0)).slice(0, 3);

  const startDate = new Date(contract.start_date).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
  const endDate = new Date(contract.end_date).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <section className="ix-card p-5 space-y-4" dir={lang === 'ar' ? 'rtl' : undefined}>
      <h2 className="text-sm font-semibold font-serif text-slate-900 dark:text-slate-100">Project Details</h2>

      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        {contract.customer && (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Customer</dt>
            <dd className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">{contract.customer}</dd>
          </div>
        )}
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Contract Period</dt>
          <dd className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">{startDate} — {endDate}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Duration</dt>
          <dd className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">{contract.duration_months} months</dd>
        </div>
        {zones.length > 0 && (
          <div className="sm:col-span-2">
            <dt className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">Zones</dt>
            <dd className="flex flex-wrap gap-1.5">
              {zones.map((z, i) => (
                <span key={i} className="text-[11px] px-2 py-0.5 bg-fmplus-yellow/10 dark:bg-fmplus-gold/15 border border-fmplus-gold/30 text-fmplus-gold dark:text-fmplus-yellow rounded-full font-body">
                  {z}
                </span>
              ))}
            </dd>
          </div>
        )}
      </dl>

      {/* Contacts */}
      <div>
        <h3 className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">Customer Contacts</h3>
        {sortedContacts.length === 0 ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 italic">Contacts to be confirmed.</p>
        ) : (
          <ul className="space-y-2">
            {sortedContacts.map((c, i) => (
              <li key={i} className="flex items-start gap-3">
                {c.primary && (
                  <span className="mt-0.5 text-[9px] px-1.5 py-0.5 bg-fmplus-yellow/20 text-fmplus-gold dark:text-fmplus-yellow rounded font-semibold font-body uppercase tracking-wide">Primary</span>
                )}
                <div className="text-sm">
                  <span className="font-medium text-slate-900 dark:text-slate-100">
                    <LangLabel en={c.name} lang={lang} />
                  </span>
                  {c.role && <span className="text-slate-500 dark:text-slate-400 ml-2 text-xs">{c.role}</span>}
                  {c.email && <span className="block text-xs text-slate-400 dark:text-slate-500">{c.email}</span>}
                  {c.phone && <span className="text-xs text-slate-400 dark:text-slate-500 ml-0">{c.phone}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Scope summary */}
      {scope_summary && (
        <div>
          <h3 className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1">Scope Summary</h3>
          <p className="text-sm text-slate-700 dark:text-slate-300 font-body whitespace-pre-line">{scope_summary}</p>
        </div>
      )}
    </section>
  );
}
