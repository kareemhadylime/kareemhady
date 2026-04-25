'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ListOrdered, Search, Clock, Receipt, Ship, Calendar, Lock,
} from 'lucide-react';

// Sticky bottom navigation for broker + owner on mobile (<md).
// Hidden ≥md where the top tab bar is the primary nav.
//
// Pages that render this need pb-safe-bottom-nav (~72px + safe inset)
// on their main container so content doesn't slide under the bar.

type Item = { href: string; label: string; icon: React.ComponentType<{ size?: number }> };

const BROKER_BOTTOM_TABS: Item[] = [
  { href: '/emails/boat-rental/broker', label: 'Bookings', icon: ListOrdered },
  { href: '/emails/boat-rental/broker/availability', label: 'Find', icon: Search },
  { href: '/emails/boat-rental/broker/holds', label: 'Holds', icon: Clock },
  { href: '/emails/boat-rental/broker/payments', label: 'Pay', icon: Receipt },
];

const OWNER_BOTTOM_TABS: Item[] = [
  { href: '/emails/boat-rental/owner', label: 'Boats', icon: Ship },
  { href: '/emails/boat-rental/owner/calendar', label: 'Calendar', icon: Lock },
  { href: '/emails/boat-rental/owner/reservations', label: 'Bookings', icon: ListOrdered },
];

function BottomNavBar({ tabs }: { tabs: Item[] }) {
  const pathname = usePathname();
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur safe-pb"
      role="navigation"
      aria-label="Primary"
    >
      <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map(t => {
          // Active when exact match OR (sub-route AND it isn't the parent landing).
          const isHome = t.href.split('/').length === 4; // /emails/boat-rental/broker etc.
          const active = pathname === t.href || (!isHome && pathname.startsWith(t.href));
          const Icon = t.icon;
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className="flex flex-col items-center justify-center gap-1 py-2.5 min-tap"
                aria-current={active ? 'page' : undefined}
              >
                {active && <span className="absolute -translate-y-2 w-8 h-1 rounded-full bg-cyan-500" aria-hidden />}
                <Icon size={18} />
                <span className={`text-[10px] font-semibold tracking-wide ${active ? 'text-cyan-700 dark:text-cyan-300' : 'text-slate-500 dark:text-slate-400'}`}>
                  {t.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function BrokerBottomNav() {
  return <BottomNavBar tabs={BROKER_BOTTOM_TABS} />;
}

export function OwnerBottomNav() {
  return <BottomNavBar tabs={OWNER_BOTTOM_TABS} />;
}
