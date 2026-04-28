import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// Reusable launcher-grid card. Mirrors the boat-rental admin pattern
// (see src/app/emails/boat-rental/admin/page.tsx) but applied to the
// Beit Hady palette: slate primary + cream backdrop + gold accent.

export type LauncherTile = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  /** Tailwind palette key — slate is the canonical Beithady accent;
      gold/amber/emerald used for distinguishable category cards. */
  accent: 'slate' | 'amber' | 'emerald' | 'rose' | 'cyan' | 'violet' | 'indigo' | 'gold';
  badge?: { label: string; tone?: 'navy' | 'gold' | 'cream' };
  disabled?: boolean;
  comingSoonLabel?: string;
};

const ACCENT_CLASSES: Record<LauncherTile['accent'], {
  iconBg: string;
  iconText: string;
  hoverBorder: string;
  arrow: string;
  gradFrom: string;
  gradTo: string;
}> = {
  slate:   { iconBg: 'bg-slate-50 dark:bg-slate-900/60',     iconText: 'text-slate-700 dark:text-slate-300',   hoverBorder: 'group-hover:border-slate-400',   arrow: 'group-hover:text-slate-700',   gradFrom: 'from-slate-500',   gradTo: 'to-slate-700' },
  amber:   { iconBg: 'bg-amber-50 dark:bg-amber-950',        iconText: 'text-amber-700 dark:text-amber-300',   hoverBorder: 'group-hover:border-amber-400',   arrow: 'group-hover:text-amber-600',   gradFrom: 'from-amber-400',   gradTo: 'to-amber-600' },
  emerald: { iconBg: 'bg-emerald-50 dark:bg-emerald-950',    iconText: 'text-emerald-700 dark:text-emerald-300', hoverBorder: 'group-hover:border-emerald-400', arrow: 'group-hover:text-emerald-600', gradFrom: 'from-emerald-400', gradTo: 'to-emerald-600' },
  rose:    { iconBg: 'bg-rose-50 dark:bg-rose-950',          iconText: 'text-rose-700 dark:text-rose-300',     hoverBorder: 'group-hover:border-rose-400',    arrow: 'group-hover:text-rose-600',    gradFrom: 'from-rose-400',    gradTo: 'to-rose-600' },
  cyan:    { iconBg: 'bg-cyan-50 dark:bg-cyan-950',          iconText: 'text-cyan-700 dark:text-cyan-300',     hoverBorder: 'group-hover:border-cyan-400',    arrow: 'group-hover:text-cyan-600',    gradFrom: 'from-cyan-400',    gradTo: 'to-cyan-600' },
  violet:  { iconBg: 'bg-violet-50 dark:bg-violet-950',      iconText: 'text-violet-700 dark:text-violet-300', hoverBorder: 'group-hover:border-violet-400',  arrow: 'group-hover:text-violet-600',  gradFrom: 'from-violet-400',  gradTo: 'to-violet-600' },
  indigo:  { iconBg: 'bg-indigo-50 dark:bg-indigo-950',      iconText: 'text-indigo-700 dark:text-indigo-300', hoverBorder: 'group-hover:border-indigo-400',  arrow: 'group-hover:text-indigo-600',  gradFrom: 'from-indigo-400',  gradTo: 'to-indigo-600' },
  // 'gold' isn't a default Tailwind palette — we map it to yellow
  // since brand gold ≈ #D4A93A which sits between yellow-500 and
  // yellow-600 in the Tailwind ramp.
  gold:    { iconBg: 'bg-yellow-50 dark:bg-yellow-950',      iconText: 'text-yellow-700 dark:text-yellow-300', hoverBorder: 'group-hover:border-yellow-400',  arrow: 'group-hover:text-yellow-600',  gradFrom: 'from-yellow-400',  gradTo: 'to-yellow-600' },
};

const BADGE_CLASSES: Record<NonNullable<NonNullable<LauncherTile['badge']>['tone']>, string> = {
  navy:  'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  gold:  'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  cream: 'bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200',
};

export function BeithadyLauncher({ tiles, columns = 3 }: { tiles: LauncherTile[]; columns?: 2 | 3 }) {
  const colClass = columns === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3';
  return (
    <section className={`grid grid-cols-1 sm:grid-cols-2 ${colClass} gap-5`}>
      {tiles.map(t => (
        <LauncherCard key={t.href} t={t} />
      ))}
    </section>
  );
}

function LauncherCard({ t }: { t: LauncherTile }) {
  const a = ACCENT_CLASSES[t.accent];
  const Icon = t.icon;
  const isLink = !t.disabled;
  const Wrapper: React.ElementType = isLink ? Link : 'div';
  const wrapperProps: Record<string, unknown> = isLink ? { href: t.href } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`group relative ix-card p-6 overflow-hidden transition border ${
        isLink ? 'hover:shadow-md hover:-translate-y-0.5 ' + a.hoverBorder : 'opacity-70'
      }`}
    >
      <div className={`absolute -top-8 -right-8 w-40 h-40 rounded-full bg-gradient-to-br ${a.gradFrom} ${a.gradTo} opacity-[0.08] blur-2xl pointer-events-none`} />

      <div className="flex items-start justify-between gap-3">
        <div className={`w-12 h-12 rounded-xl inline-flex items-center justify-center ${a.iconBg}`}>
          <Icon size={24} strokeWidth={2.2} className={a.iconText} />
        </div>
        {isLink && (
          <ArrowRight
            size={18}
            className={`text-slate-400 transition group-hover:translate-x-0.5 ${a.arrow}`}
          />
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <h2 className="text-xl font-semibold tracking-tight" style={{ color: 'var(--bh-navy)' }}>
          {t.title}
        </h2>
        {t.badge && (
          <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${BADGE_CLASSES[t.badge.tone || 'navy']}`}>
            {t.badge.label}
          </span>
        )}
        {t.disabled && t.comingSoonLabel && (
          <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
            {t.comingSoonLabel}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 max-w-md">{t.description}</p>
    </Wrapper>
  );
}
