import type { ReportData } from '../../types';

export function PaymentTerms({ data }: { data: ReportData }) {
  const days = data.payment_terms_days;
  const label = days != null ? `Net ${days} days` : 'Not specified';

  const isProposed = data.meta.mode === 'pre';

  return (
    <section className="ix-card p-5 space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold font-serif text-slate-900 dark:text-slate-100">Payment Terms</h2>
        {isProposed && (
          <span className="text-[10px] px-2 py-0.5 bg-amber-500/15 border border-amber-500/40 text-amber-600 dark:text-amber-400 rounded-full font-semibold font-body uppercase tracking-wide">
            Proposed
          </span>
        )}
      </div>
      <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 bg-slate-50 dark:bg-slate-900/50">
        <p className="text-sm text-slate-700 dark:text-slate-300 font-body tabular-nums leading-relaxed">
          {label}
        </p>
      </div>
    </section>
  );
}
