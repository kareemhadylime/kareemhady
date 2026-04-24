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
    <nav className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 -mx-6 px-6 pb-0">
      {tabs.map(t => {
        const active = t.href === currentPath || (t.href !== tabs[0].href && currentPath.startsWith(t.href));
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              'inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition ' +
              (active
                ? 'border-cyan-600 text-cyan-700'
                : 'border-transparent text-slate-500 hover:text-slate-800')
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
