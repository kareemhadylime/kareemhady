import Link from 'next/link';
import {
  LayoutDashboard, Ship, Tag, CalendarRange, MapPin, Users, Bell, ListOrdered, History,
  Search, Clock, Receipt, Calendar, User2,
} from 'lucide-react';

// Tab groups per role. Kept as plain data so the active tab can be
// highlighted by matching the pathname in a server-rendered wrapper.

export type TabItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
};

export const ADMIN_TABS: TabItem[] = [
  { href: '/emails/boat-rental/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/emails/boat-rental/admin/owners', label: 'Owners', icon: User2 },
  { href: '/emails/boat-rental/admin/boats', label: 'Boats', icon: Ship },
  { href: '/emails/boat-rental/admin/pricing', label: 'Pricing', icon: Tag },
  { href: '/emails/boat-rental/admin/seasons', label: 'Seasons', icon: CalendarRange },
  { href: '/emails/boat-rental/admin/destinations', label: 'Destinations', icon: MapPin },
  { href: '/emails/boat-rental/admin/users', label: 'Users', icon: Users },
  { href: '/emails/boat-rental/admin/bookings', label: 'All Bookings', icon: ListOrdered },
  { href: '/emails/boat-rental/admin/notifications', label: 'Notifications', icon: Bell },
  { href: '/emails/boat-rental/admin/audit', label: 'Audit Log', icon: History },
];

export const BROKER_TABS: TabItem[] = [
  { href: '/emails/boat-rental/broker', label: 'My Bookings', icon: ListOrdered },
  { href: '/emails/boat-rental/broker/availability', label: 'Check Availability', icon: Search },
  { href: '/emails/boat-rental/broker/holds', label: 'Active Holds', icon: Clock },
  { href: '/emails/boat-rental/broker/payments', label: 'Payment Confirmation', icon: Receipt },
];

export const OWNER_TABS: TabItem[] = [
  { href: '/emails/boat-rental/owner', label: 'My Boats', icon: Ship },
  { href: '/emails/boat-rental/owner/calendar', label: 'Calendar', icon: Calendar },
];

export function TabNav({ tabs, currentPath }: { tabs: TabItem[]; currentPath: string }) {
  return (
    <nav className="flex items-center gap-2 overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6 pb-2">
      {tabs.map(t => {
        const active = t.href === currentPath || (t.href !== tabs[0].href && currentPath.startsWith(t.href));
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={
              'inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border text-sm font-medium whitespace-nowrap transition shrink-0 ' +
              (active
                ? 'bg-cyan-600 text-white border-cyan-600 shadow-sm hover:bg-cyan-700'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-cyan-300 dark:hover:border-cyan-700 hover:text-cyan-700 dark:hover:text-cyan-300 hover:bg-cyan-50/50 dark:hover:bg-cyan-950/30')
            }
          >
            <Icon size={14} strokeWidth={2.2} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
