'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Briefcase, ArrowLeftRight, Wallet,
  Coins, Building2, Tag, Upload,
} from 'lucide-react';

const TABS = [
  { href: '/personal/stocks',               label: 'Dashboard',    icon: LayoutDashboard },
  { href: '/personal/stocks/portfolio',     label: 'Portfolio',    icon: Briefcase },
  { href: '/personal/stocks/transactions',  label: 'Transactions', icon: ArrowLeftRight },
  { href: '/personal/stocks/cash-flow',     label: 'Cash Flow',    icon: Wallet },
  { href: '/personal/stocks/dividends',     label: 'Dividends',    icon: Coins },
  { href: '/personal/stocks/accounts',      label: 'Accounts',     icon: Building2 },
  { href: '/personal/stocks/prices',        label: 'Prices',       icon: Tag },
  { href: '/personal/stocks/import',        label: 'Import',       icon: Upload },
];

export function StocksTabNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700 pb-1 mb-4">
      {TABS.map((t) => {
        const active = pathname === t.href || (t.href !== '/personal/stocks' && pathname.startsWith(t.href));
        const Icon = t.icon;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-1.5 rounded-md text-sm inline-flex items-center gap-1.5 transition
              ${active
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}
          >
            <Icon size={14} />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
