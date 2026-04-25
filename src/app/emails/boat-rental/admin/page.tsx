import Link from 'next/link';
import {
  Ship, LayoutDashboard, Settings, ListOrdered, Bell, History, ArrowRight, BookOpen,
} from 'lucide-react';

// Admin landing — launcher grid of large box buttons. Each button is a
// section entry point. The section pages (admin/dashboard, admin/owners,
// etc.) render the TabNav at top so users can hop between sections
// without coming back here.

export const dynamic = 'force-dynamic';

type Section = {
  href: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  // Tailwind palette key (light + dark variants follow naming convention).
  accent: 'cyan' | 'violet' | 'emerald' | 'amber' | 'indigo' | 'pink' | 'blue' | 'rose' | 'slate';
};

const SECTIONS: Section[] = [
  {
    href: '/emails/boat-rental/admin/dashboard',
    title: 'Dashboard',
    description: 'Revenue, KPIs, today and tomorrow trips, alerts, leaderboards.',
    icon: LayoutDashboard,
    accent: 'cyan',
  },
  {
    href: '/emails/boat-rental/admin/setup',
    title: 'Setup',
    description: 'Owners · Boats · Pricing · Seasons · Destinations · Users — fleet and access configuration.',
    icon: Settings,
    accent: 'violet',
  },
  {
    href: '/emails/boat-rental/admin/bookings',
    title: 'All Bookings',
    description: 'Every reservation with filters, force-cancel, refund flag.',
    icon: ListOrdered,
    accent: 'blue',
  },
  {
    href: '/emails/boat-rental/admin/inventory',
    title: 'Boat Catalogue',
    description: 'Browse the fleet, view photos, download a one-page PDF spec sheet to share.',
    icon: BookOpen,
    accent: 'emerald',
  },
  {
    href: '/emails/boat-rental/admin/notifications',
    title: 'Notifications',
    description: 'WhatsApp delivery log; retry failed messages.',
    icon: Bell,
    accent: 'rose',
  },
  {
    href: '/emails/boat-rental/admin/audit',
    title: 'Audit Log',
    description: 'Every state transition with actor and timestamp.',
    icon: History,
    accent: 'slate',
  },
];

// Static class maps — Tailwind needs full class names at build time, so
// we list every accent's classes explicitly rather than interpolating.
const ACCENT_CLASSES: Record<Section['accent'], {
  iconBg: string;
  iconText: string;
  border: string;
  hoverBorder: string;
  hoverShadow: string;
  arrow: string;
  gradFrom: string;
  gradTo: string;
}> = {
  cyan:    { iconBg: 'bg-cyan-50 dark:bg-cyan-950',       iconText: 'text-cyan-600 dark:text-cyan-300',     border: 'border-slate-200 dark:border-slate-700', hoverBorder: 'group-hover:border-cyan-400 dark:group-hover:border-cyan-600',       hoverShadow: 'group-hover:shadow-cyan-500/10',    arrow: 'group-hover:text-cyan-600',    gradFrom: 'from-cyan-500',    gradTo: 'to-teal-500'    },
  violet:  { iconBg: 'bg-violet-50 dark:bg-violet-950',   iconText: 'text-violet-600 dark:text-violet-300', border: 'border-slate-200 dark:border-slate-700', hoverBorder: 'group-hover:border-violet-400 dark:group-hover:border-violet-600',   hoverShadow: 'group-hover:shadow-violet-500/10',  arrow: 'group-hover:text-violet-600',  gradFrom: 'from-violet-500',  gradTo: 'to-purple-500'  },
  emerald: { iconBg: 'bg-emerald-50 dark:bg-emerald-950', iconText: 'text-emerald-600 dark:text-emerald-300', border: 'border-slate-200 dark:border-slate-700', hoverBorder: 'group-hover:border-emerald-400 dark:group-hover:border-emerald-600', hoverShadow: 'group-hover:shadow-emerald-500/10', arrow: 'group-hover:text-emerald-600', gradFrom: 'from-emerald-500', gradTo: 'to-teal-500'    },
  amber:   { iconBg: 'bg-amber-50 dark:bg-amber-950',     iconText: 'text-amber-600 dark:text-amber-300',   border: 'border-slate-200 dark:border-slate-700', hoverBorder: 'group-hover:border-amber-400 dark:group-hover:border-amber-600',     hoverShadow: 'group-hover:shadow-amber-500/10',   arrow: 'group-hover:text-amber-600',   gradFrom: 'from-amber-500',   gradTo: 'to-orange-500'  },
  indigo:  { iconBg: 'bg-indigo-50 dark:bg-indigo-950',   iconText: 'text-indigo-600 dark:text-indigo-300', border: 'border-slate-200 dark:border-slate-700', hoverBorder: 'group-hover:border-indigo-400 dark:group-hover:border-indigo-600',   hoverShadow: 'group-hover:shadow-indigo-500/10',  arrow: 'group-hover:text-indigo-600',  gradFrom: 'from-indigo-500',  gradTo: 'to-blue-500'    },
  pink:    { iconBg: 'bg-pink-50 dark:bg-pink-950',       iconText: 'text-pink-600 dark:text-pink-300',     border: 'border-slate-200 dark:border-slate-700', hoverBorder: 'group-hover:border-pink-400 dark:group-hover:border-pink-600',       hoverShadow: 'group-hover:shadow-pink-500/10',    arrow: 'group-hover:text-pink-600',    gradFrom: 'from-pink-500',    gradTo: 'to-rose-500'    },
  blue:    { iconBg: 'bg-blue-50 dark:bg-blue-950',       iconText: 'text-blue-600 dark:text-blue-300',     border: 'border-slate-200 dark:border-slate-700', hoverBorder: 'group-hover:border-blue-400 dark:group-hover:border-blue-600',       hoverShadow: 'group-hover:shadow-blue-500/10',    arrow: 'group-hover:text-blue-600',    gradFrom: 'from-blue-500',    gradTo: 'to-cyan-500'    },
  rose:    { iconBg: 'bg-rose-50 dark:bg-rose-950',       iconText: 'text-rose-600 dark:text-rose-300',     border: 'border-slate-200 dark:border-slate-700', hoverBorder: 'group-hover:border-rose-400 dark:group-hover:border-rose-600',       hoverShadow: 'group-hover:shadow-rose-500/10',    arrow: 'group-hover:text-rose-600',    gradFrom: 'from-rose-500',    gradTo: 'to-pink-500'    },
  slate:   { iconBg: 'bg-slate-100 dark:bg-slate-800',    iconText: 'text-slate-600 dark:text-slate-300',   border: 'border-slate-200 dark:border-slate-700', hoverBorder: 'group-hover:border-slate-400 dark:group-hover:border-slate-500',     hoverShadow: 'group-hover:shadow-slate-500/10',   arrow: 'group-hover:text-slate-700',   gradFrom: 'from-slate-500',   gradTo: 'to-slate-700'   },
};

export default function BoatRentalAdminMenu() {
  return (
    <>
      <header className="flex items-start gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-cyan-50 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-300 shrink-0">
          <Ship size={24} strokeWidth={2.2} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium">
            Personal · Boat Rental
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Admin</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Choose a section to manage. Each box opens its own page; you can hop between sections from the tabs once inside.
          </p>
        </div>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {SECTIONS.map(s => {
          const Icon = s.icon;
          const c = ACCENT_CLASSES[s.accent];
          return (
            <Link
              key={s.href}
              href={s.href}
              className={`group relative overflow-hidden rounded-2xl bg-white dark:bg-slate-900 border ${c.border} ${c.hoverBorder} p-5 sm:p-6 transition-all hover:shadow-lg ${c.hoverShadow} hover:-translate-y-0.5 min-h-[140px] flex flex-col justify-between`}
            >
              {/* Decorative corner glow */}
              <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full bg-gradient-to-br ${c.gradFrom} ${c.gradTo} opacity-[0.07] group-hover:opacity-[0.12] blur-2xl pointer-events-none transition`} />

              <div className="relative flex items-start justify-between gap-3 mb-3">
                <div className={`w-12 h-12 rounded-xl inline-flex items-center justify-center ${c.iconBg} ${c.iconText} shrink-0`}>
                  <Icon size={24} strokeWidth={2.2} />
                </div>
                <ArrowRight size={18} className={`text-slate-400 ${c.arrow} group-hover:translate-x-0.5 transition shrink-0 mt-2`} />
              </div>

              <div className="relative">
                <h3 className="font-bold text-base text-slate-900 dark:text-slate-100">{s.title}</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                  {s.description}
                </p>
              </div>
            </Link>
          );
        })}
      </section>
    </>
  );
}
