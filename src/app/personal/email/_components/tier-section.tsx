import { TIER_LABELS, TIER_DESCRIPTIONS, TIER_ACCENTS } from '@/lib/personal-email/categories';

const ACCENT_DOT: Record<string, string> = {
  rose: 'bg-rose-500',
  emerald: 'bg-emerald-500',
  indigo: 'bg-indigo-500',
  zinc: 'bg-zinc-400',
};

export function TierSection({
  tier, count, children,
}: { tier: 1 | 2 | 3 | 4; count?: number; children: React.ReactNode }) {
  const dotClass = ACCENT_DOT[TIER_ACCENTS[tier]] ?? 'bg-slate-400';
  return (
    <section className="space-y-3">
      <header className="flex items-baseline gap-3 border-b border-slate-200 dark:border-slate-700 pb-2">
        <span className={`w-2 h-2 rounded-full ${dotClass}`} />
        <h2 className="text-xs uppercase tracking-[0.14em] font-bold text-slate-700 dark:text-slate-200">
          {TIER_LABELS[tier]}
        </h2>
        <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
          Tier {tier}
        </span>
        <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400 truncate">
          · {TIER_DESCRIPTIONS[tier]}
        </span>
        {typeof count === 'number' && count > 0 && (
          <span className="ml-auto text-[11px] font-mono font-semibold text-slate-500 dark:text-slate-400">
            {count} email{count === 1 ? '' : 's'}
          </span>
        )}
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{children}</div>
    </section>
  );
}
