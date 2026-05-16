import Link from 'next/link';
import {
  ArrowRight,
  Mail,
  Ship,
  TrendingUp,
  User,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { PersonalShell, PersonalHeader } from './_components/personal-shell';

export const dynamic = 'force-dynamic';

type Tile = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: 'slate' | 'cyan' | 'emerald' | 'indigo';
  badge?: { label: string; tone?: 'navy' | 'gold' };
};

const TILES: Tile[] = [
  {
    href: '/personal/email',
    title: 'Email',
    description:
      "Triage GMAIL · LIME · FM+ inboxes by 9 categories with rule + AI hybrid classification and two-way Gmail label sync.",
    icon: Mail,
    accent: 'slate',
    badge: { label: 'Live', tone: 'navy' },
  },
  {
    href: '/personal/stocks',
    title: 'Stock Investment',
    description:
      'AOLB broker statements: holdings, cash flow, buy/sell totals, dividends, realized + unrealized P&L across 3 accounts (001 trading, 003 margin, 009 fund).',
    icon: TrendingUp,
    accent: 'emerald',
    badge: { label: 'Live', tone: 'navy' },
  },
  {
    href: '/emails/boat-rental',
    title: 'Boat Rental',
    description:
      'Booking calendar, broker portal, owner portal, payments + receipts, recurring expenses, skipper roster.',
    icon: Ship,
    accent: 'cyan',
    badge: { label: 'Live', tone: 'navy' },
  },
  {
    href: '/personal/networth',
    title: 'Net Worth',
    description:
      "Assets, loans + liabilities, recurring payments, charity, monthly report, and historical net-worth chart — totals in EGP.",
    icon: Wallet,
    accent: 'indigo',
    badge: { label: 'Live', tone: 'navy' },
  },
];

const ACCENTS: Record<Tile['accent'], {
  iconBg: string; iconText: string; hoverBorder: string; arrow: string;
  gradFrom: string; gradTo: string;
}> = {
  slate: {
    iconBg: 'bg-slate-50 dark:bg-slate-900/60', iconText: 'text-slate-700 dark:text-slate-300',
    hoverBorder: 'group-hover:border-slate-400', arrow: 'group-hover:text-slate-700',
    gradFrom: 'from-slate-500', gradTo: 'to-slate-700',
  },
  cyan: {
    iconBg: 'bg-cyan-50 dark:bg-cyan-950', iconText: 'text-cyan-700 dark:text-cyan-300',
    hoverBorder: 'group-hover:border-cyan-400', arrow: 'group-hover:text-cyan-600',
    gradFrom: 'from-cyan-400', gradTo: 'to-cyan-600',
  },
  emerald: {
    iconBg: 'bg-emerald-50 dark:bg-emerald-950', iconText: 'text-emerald-700 dark:text-emerald-300',
    hoverBorder: 'group-hover:border-emerald-400', arrow: 'group-hover:text-emerald-600',
    gradFrom: 'from-emerald-400', gradTo: 'to-emerald-600',
  },
  indigo: {
    iconBg: 'bg-indigo-50 dark:bg-indigo-950', iconText: 'text-indigo-700 dark:text-indigo-300',
    hoverBorder: 'group-hover:border-indigo-400', arrow: 'group-hover:text-indigo-600',
    gradFrom: 'from-indigo-400', gradTo: 'to-indigo-600',
  },
};

const BADGE_TONES: Record<'navy' | 'gold', string> = {
  navy: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  gold: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
};

export default function PersonalLandingPage() {
  return (
    <PersonalShell>
      <PersonalHeader
        eyebrow="Subsidiary cockpit"
        title="Personal"
        subtitle="Apps that don't belong to a subsidiary — Kareem's personal email triage and the boat-rental side venture."
        icon={User}
      />

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {TILES.map(t => <LauncherCard key={t.href} t={t} />)}
      </section>

      <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Personal — Lime Investments holding
      </footer>
    </PersonalShell>
  );
}

function LauncherCard({ t }: { t: Tile }) {
  const a = ACCENTS[t.accent];
  const Icon = t.icon;
  return (
    <Link
      href={t.href}
      className={`group relative ix-card p-6 overflow-hidden border transition hover:shadow-md hover:-translate-y-0.5 ${a.hoverBorder}`}
    >
      <div className={`absolute -top-8 -right-8 w-40 h-40 rounded-full bg-gradient-to-br ${a.gradFrom} ${a.gradTo} opacity-[0.08] blur-2xl pointer-events-none`} />
      <div className="flex items-start justify-between gap-3">
        <div className={`w-12 h-12 rounded-xl inline-flex items-center justify-center ${a.iconBg}`}>
          <Icon size={24} strokeWidth={2.2} className={a.iconText} />
        </div>
        <ArrowRight size={18} className={`text-slate-400 transition group-hover:translate-x-0.5 ${a.arrow}`} />
      </div>
      <div className="mt-4 flex items-center gap-2 flex-wrap">
        <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-50">
          {t.title}
        </h2>
        {t.badge && (
          <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${BADGE_TONES[t.badge.tone || 'navy']}`}>
            {t.badge.label}
          </span>
        )}
      </div>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300 max-w-md">
        {t.description}
      </p>
    </Link>
  );
}
