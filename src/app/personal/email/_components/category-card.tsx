import Link from 'next/link';
import {
  ArrowRight,
  Reply,
  ShieldCheck,
  Plane,
  Receipt,
  Heart,
  BookOpen,
  Bell,
  Tag,
  XCircle,
  ShoppingBag,
  Home,
  MessageSquare,
  Landmark,
  Wrench,
  Mail,
  type LucideIcon,
} from 'lucide-react';
import type { CategoryDef } from '@/lib/personal-email/categories';
import type { InboxRow } from '@/lib/personal-email/inbox-query';
import { isNewReservation, isImmediateIntervention, isInvoiceToBePaid, isLowPriority } from '@/lib/personal-email/email-helpers';

// Icon registry mapping seeded `iconName` strings to actual lucide
// icons. Keep in sync with categories.ts seed.
const ICONS: Record<string, LucideIcon> = {
  Reply,
  ShieldCheck,
  Plane,
  Receipt,
  Heart,
  BookOpen,
  Bell,
  Tag,
  XCircle,
  ShoppingBag,
  Home,
  MessageSquare,
  Landmark,
  Wrench,
};

// Pre-rendered Tailwind class lookups so dynamic accents work in
// production builds (Tailwind can't see `text-${x}-700` at compile
// time without the JIT extracting these statically). Keep in sync
// with the seeded `accent_color` values in categories.ts.
const ACCENTS: Record<string, {
  iconBg: string; iconText: string; hoverBorder: string; arrow: string;
  countBg: string; countText: string; gradFrom: string; gradTo: string;
}> = {
  rose: {
    iconBg: 'bg-rose-50 dark:bg-rose-950', iconText: 'text-rose-700 dark:text-rose-300',
    hoverBorder: 'group-hover:border-rose-400', arrow: 'group-hover:text-rose-600',
    countBg: 'bg-rose-50 dark:bg-rose-950', countText: 'text-rose-700 dark:text-rose-300',
    gradFrom: 'from-rose-400', gradTo: 'to-rose-600',
  },
  amber: {
    iconBg: 'bg-amber-50 dark:bg-amber-950', iconText: 'text-amber-700 dark:text-amber-300',
    hoverBorder: 'group-hover:border-amber-400', arrow: 'group-hover:text-amber-600',
    countBg: 'bg-amber-50 dark:bg-amber-950', countText: 'text-amber-700 dark:text-amber-300',
    gradFrom: 'from-amber-400', gradTo: 'to-amber-600',
  },
  sky: {
    iconBg: 'bg-sky-50 dark:bg-sky-950', iconText: 'text-sky-700 dark:text-sky-300',
    hoverBorder: 'group-hover:border-sky-400', arrow: 'group-hover:text-sky-600',
    countBg: 'bg-sky-50 dark:bg-sky-950', countText: 'text-sky-700 dark:text-sky-300',
    gradFrom: 'from-sky-400', gradTo: 'to-sky-600',
  },
  emerald: {
    iconBg: 'bg-emerald-50 dark:bg-emerald-950', iconText: 'text-emerald-700 dark:text-emerald-300',
    hoverBorder: 'group-hover:border-emerald-400', arrow: 'group-hover:text-emerald-600',
    countBg: 'bg-emerald-50 dark:bg-emerald-950', countText: 'text-emerald-700 dark:text-emerald-300',
    gradFrom: 'from-emerald-400', gradTo: 'to-emerald-600',
  },
  pink: {
    iconBg: 'bg-pink-50 dark:bg-pink-950', iconText: 'text-pink-700 dark:text-pink-300',
    hoverBorder: 'group-hover:border-pink-400', arrow: 'group-hover:text-pink-600',
    countBg: 'bg-pink-50 dark:bg-pink-950', countText: 'text-pink-700 dark:text-pink-300',
    gradFrom: 'from-pink-400', gradTo: 'to-pink-600',
  },
  teal: {
    iconBg: 'bg-teal-50 dark:bg-teal-950', iconText: 'text-teal-700 dark:text-teal-300',
    hoverBorder: 'group-hover:border-teal-400', arrow: 'group-hover:text-teal-600',
    countBg: 'bg-teal-50 dark:bg-teal-950', countText: 'text-teal-700 dark:text-teal-300',
    gradFrom: 'from-teal-400', gradTo: 'to-teal-600',
  },
  blue: {
    iconBg: 'bg-blue-50 dark:bg-blue-950', iconText: 'text-blue-700 dark:text-blue-300',
    hoverBorder: 'group-hover:border-blue-400', arrow: 'group-hover:text-blue-600',
    countBg: 'bg-blue-50 dark:bg-blue-950', countText: 'text-blue-700 dark:text-blue-300',
    gradFrom: 'from-blue-400', gradTo: 'to-blue-600',
  },
  green: {
    iconBg: 'bg-green-50 dark:bg-green-950', iconText: 'text-green-700 dark:text-green-300',
    hoverBorder: 'group-hover:border-green-400', arrow: 'group-hover:text-green-600',
    countBg: 'bg-green-50 dark:bg-green-950', countText: 'text-green-700 dark:text-green-300',
    gradFrom: 'from-green-400', gradTo: 'to-green-600',
  },
  orange: {
    iconBg: 'bg-orange-50 dark:bg-orange-950', iconText: 'text-orange-700 dark:text-orange-300',
    hoverBorder: 'group-hover:border-orange-400', arrow: 'group-hover:text-orange-600',
    countBg: 'bg-orange-50 dark:bg-orange-950', countText: 'text-orange-700 dark:text-orange-300',
    gradFrom: 'from-orange-400', gradTo: 'to-orange-600',
  },
  indigo: {
    iconBg: 'bg-indigo-50 dark:bg-indigo-950', iconText: 'text-indigo-700 dark:text-indigo-300',
    hoverBorder: 'group-hover:border-indigo-400', arrow: 'group-hover:text-indigo-600',
    countBg: 'bg-indigo-50 dark:bg-indigo-950', countText: 'text-indigo-700 dark:text-indigo-300',
    gradFrom: 'from-indigo-400', gradTo: 'to-indigo-600',
  },
  slate: {
    iconBg: 'bg-slate-50 dark:bg-slate-900/60', iconText: 'text-slate-700 dark:text-slate-300',
    hoverBorder: 'group-hover:border-slate-400', arrow: 'group-hover:text-slate-700',
    countBg: 'bg-slate-100 dark:bg-slate-800', countText: 'text-slate-700 dark:text-slate-200',
    gradFrom: 'from-slate-400', gradTo: 'to-slate-600',
  },
  violet: {
    iconBg: 'bg-violet-50 dark:bg-violet-950', iconText: 'text-violet-700 dark:text-violet-300',
    hoverBorder: 'group-hover:border-violet-400', arrow: 'group-hover:text-violet-600',
    countBg: 'bg-violet-50 dark:bg-violet-950', countText: 'text-violet-700 dark:text-violet-300',
    gradFrom: 'from-violet-400', gradTo: 'to-violet-600',
  },
  zinc: {
    iconBg: 'bg-zinc-100 dark:bg-zinc-800', iconText: 'text-zinc-700 dark:text-zinc-300',
    hoverBorder: 'group-hover:border-zinc-400', arrow: 'group-hover:text-zinc-600',
    countBg: 'bg-zinc-100 dark:bg-zinc-800', countText: 'text-zinc-700 dark:text-zinc-200',
    gradFrom: 'from-zinc-400', gradTo: 'to-zinc-600',
  },
};

export function CategoryCard({
  cat, count, top3, basePath,
}: {
  cat: CategoryDef;
  count: number;
  top3: InboxRow[];
  basePath: string;
}) {
  const a = ACCENTS[cat.accentColor] ?? ACCENTS.slate;
  const Icon = ICONS[cat.iconName] ?? Mail;
  const isEmpty = count === 0;

  return (
    <Link
      href={`${basePath}?category=${cat.slug}`}
      className={`group relative ix-card p-5 overflow-hidden border transition hover:shadow-md hover:-translate-y-0.5 ${a.hoverBorder} ${isEmpty ? 'opacity-80' : ''}`}
    >
      <div className={`absolute -top-8 -right-8 w-40 h-40 rounded-full bg-gradient-to-br ${a.gradFrom} ${a.gradTo} opacity-[0.08] blur-2xl pointer-events-none`} />

      <div className="flex items-start justify-between gap-3">
        <div className={`w-11 h-11 rounded-xl inline-flex items-center justify-center ${a.iconBg}`}>
          <Icon size={22} strokeWidth={2.2} className={a.iconText} />
        </div>
        <ArrowRight size={18} className={`text-slate-400 transition group-hover:translate-x-0.5 ${a.arrow}`} />
      </div>

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <h3 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          {cat.displayName}
        </h3>
        <span className={`text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded ${a.countBg} ${a.countText}`}>
          {count}
        </span>
      </div>
      <p className="mt-1 text-xs text-slate-600 dark:text-slate-300 leading-snug">
        {cat.description}
      </p>

      {top3.length > 0 && (
        <ul className="mt-3 space-y-1 text-[11px] text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800 pt-2">
          {top3.slice(0, 3).map(r => {
            const newReservation = isNewReservation(r.subject, r.category);
            const urgent = isImmediateIntervention(r.subject, r.category);
            const toPay = isInvoiceToBePaid(r.subject, r.category);
            const lowPriority = isLowPriority(r.to_address, r.account_email);
            return (
              <li key={r.id} className={`truncate flex items-center gap-1.5 ${lowPriority && !urgent && !toPay && !newReservation ? 'opacity-60' : ''}`}>
                {urgent && (
                  <span className="shrink-0 text-[9px] font-bold tracking-wider px-1 py-0.5 rounded bg-rose-600 text-white" title="Needs immediate action">
                    URGENT
                  </span>
                )}
                {toPay && !urgent && (
                  <span className="shrink-0 text-[9px] font-bold tracking-wider px-1 py-0.5 rounded bg-yellow-500 text-black" title="Invoice to be paid">
                    TO PAY
                  </span>
                )}
                {newReservation && !urgent && !toPay && (
                  <span className="shrink-0 text-[9px] font-bold tracking-wider px-1 py-0.5 rounded bg-emerald-500 text-white" title="New reservation">
                    NEW
                  </span>
                )}
                {lowPriority && !urgent && !toPay && !newReservation && (
                  <span className="shrink-0 text-[9px] font-bold tracking-wider px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300" title="Not in To header — CC/BCC/list">
                    FYI
                  </span>
                )}
                <span className="truncate">
                  <span className="text-slate-700 dark:text-slate-200 font-medium">
                    {r.from_address?.split('<')[0].trim() || '—'}
                  </span>
                  <span className="text-slate-400 dark:text-slate-500"> · {r.subject || '(no subject)'}</span>
                </span>
              </li>
            );
          })}
          {count > 3 && (
            <li className="text-[10px] text-slate-400 dark:text-slate-500">+ {count - 3} more</li>
          )}
        </ul>
      )}
    </Link>
  );
}
