import Link from 'next/link';
import {
  LayoutDashboard, Ship, Tag, CalendarRange, MapPin, Users, Bell, ListOrdered, History,
  Search, Clock, Receipt, Calendar, User2, BookOpen,
} from 'lucide-react';

// Tab groups per role. Kept as plain data so the active tab can be
// highlighted by matching the pathname in a server-rendered wrapper.

export type TabItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; strokeWidth?: number }>;
};

export const ADMIN_TABS: TabItem[] = [
  { href: '/emails/boat-rental/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
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
  { href: '/emails/boat-rental/broker/inventory', label: 'Boat Catalogue', icon: BookOpen },
  { href: '/emails/boat-rental/broker', label: 'My Bookings', icon: ListOrdered },
  { href: '/emails/boat-rental/broker/availability', label: 'Check Availability', icon: Search },
  { href: '/emails/boat-rental/broker/holds', label: 'Active Holds', icon: Clock },
  { href: '/emails/boat-rental/broker/payments', label: 'Payment Confirmation', icon: Receipt },
];

export const OWNER_TABS: TabItem[] = [
  { href: '/emails/boat-rental/owner', label: 'My Boats', icon: Ship },
  { href: '/emails/boat-rental/owner/inventory', label: 'Boat Catalogue', icon: BookOpen },
  { href: '/emails/boat-rental/owner/calendar', label: 'Calendar', icon: Calendar },
  { href: '/emails/boat-rental/owner/reservations', label: 'Reservations', icon: ListOrdered },
];

// Mobile column layout per total tab count. Picked so rows are roughly
// balanced (e.g. 5 tabs → 3+2 wrap, 4 tabs → 2+2). Desktop always
// expands to a single row via the inline gridTemplateColumns below.
function mobileTemplate(n: number): string {
  if (n <= 2) return `repeat(${n}, minmax(0, 1fr))`;
  if (n === 3) return 'repeat(3, minmax(0, 1fr))';
  if (n === 4) return 'repeat(2, minmax(0, 1fr))';     // 2+2
  if (n === 5) return 'repeat(3, minmax(0, 1fr))';     // 3+2
  if (n === 6) return 'repeat(3, minmax(0, 1fr))';     // 3+3
  return 'repeat(3, minmax(0, 1fr))';                  // 7+ wraps in 3-up rows
}

// Pick the active tab as the one whose href is the longest prefix of
// the current path. Handles overlapping hrefs like '/foo' (root) and
// '/foo/bar' (sub-route) correctly: '/foo/bar' wins on '/foo/bar/x'.
function findActiveHref(tabs: TabItem[], currentPath: string): string | null {
  const matches = tabs
    .filter(t => currentPath === t.href || currentPath.startsWith(t.href + '/'))
    .sort((a, b) => b.href.length - a.href.length);
  return matches[0]?.href || null;
}

export function TabNav({ tabs, currentPath }: { tabs: TabItem[]; currentPath: string }) {
  // CSS variables let us swap the grid template at the sm: breakpoint
  // without needing one of dozens of dynamic Tailwind class strings.
  const styleVars: React.CSSProperties = {
    ['--tabs-cols-mobile' as string]: mobileTemplate(tabs.length),
    ['--tabs-cols-desktop' as string]: `repeat(${tabs.length}, minmax(0, 1fr))`,
  };
  const activeHref = findActiveHref(tabs, currentPath);
  return (
    <nav
      aria-label="Section navigation"
      className="
        -mx-4 px-4 sm:-mx-6 sm:px-6 mb-6 gap-3
        grid grid-cols-[var(--tabs-cols-mobile)] sm:grid-cols-[var(--tabs-cols-desktop)]
      "
      style={styleVars}
    >
      {tabs.map(t => {
        const active = t.href === activeHref;
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={
              'group flex flex-col items-center justify-center gap-2 py-4 px-3 rounded-xl border-2 text-sm font-semibold text-center transition ' +
              (active
                ? 'bg-cyan-600 text-white border-cyan-600 shadow-md shadow-cyan-500/30 hover:bg-cyan-700'
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-cyan-400 dark:hover:border-cyan-600 hover:text-cyan-700 dark:hover:text-cyan-300 hover:bg-cyan-50/40 dark:hover:bg-cyan-950/30 hover:shadow-md hover:-translate-y-0.5')
            }
          >
            <Icon size={20} strokeWidth={2.2} />
            <span className="leading-tight">{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
