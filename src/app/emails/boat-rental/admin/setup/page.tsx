import Link from 'next/link';
import {
  Settings, User2, Ship, Tag, CalendarRange, MapPin, Users as UsersIcon, ArrowRight,
} from 'lucide-react';
import { BackToAdminMenu } from '../_components/back-to-menu';

// Setup sub-launcher. Groups the configuration sections (Owners, Boats,
// Pricing, Seasons, Destinations, Users) so the top-level admin menu
// stays focused on operational views. Same drill-down pattern as the
// main launcher.

export const dynamic = 'force-dynamic';

type Section = {
  href: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
  accent: 'cyan' | 'violet' | 'emerald' | 'amber' | 'indigo' | 'pink';
};

const SECTIONS: Section[] = [
  {
    href: '/emails/boat-rental/admin/owners',
    title: 'Owners',
    description: 'Boat owners — names, WhatsApp, email, payment notifications.',
    icon: User2,
    accent: 'violet',
  },
  {
    href: '/emails/boat-rental/admin/boats',
    title: 'Boats',
    description: 'Boat inventory: capacity, owner, skipper, photo gallery.',
    icon: Ship,
    accent: 'cyan',
  },
  {
    href: '/emails/boat-rental/admin/pricing',
    title: 'Pricing',
    description: 'Net-to-owner amounts per boat: weekday, weekend, season.',
    icon: Tag,
    accent: 'emerald',
  },
  {
    href: '/emails/boat-rental/admin/seasons',
    title: 'Seasons',
    description: 'Named holiday and season date ranges that override pricing tier.',
    icon: CalendarRange,
    accent: 'amber',
  },
  {
    href: '/emails/boat-rental/admin/destinations',
    title: 'Destinations',
    description: 'Trip destinations shown in the broker day-before form.',
    icon: MapPin,
    accent: 'indigo',
  },
  {
    href: '/emails/boat-rental/admin/users',
    title: 'Users',
    description: 'Invite brokers and owners; assign roles and reset passwords.',
    icon: UsersIcon,
    accent: 'pink',
  },
];

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
};

export default function BoatRentalSetupMenu() {
  return (
    <>
      <BackToAdminMenu />
      <header className="flex items-start gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-violet-50 dark:bg-violet-950 text-violet-600 dark:text-violet-300 shrink-0">
          <Settings size={24} strokeWidth={2.2} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium">
            Personal · Boat Rental · Admin
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Setup</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Inventory, pricing, and access configuration. Sections are independent — set them up in any order.
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
