'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Wallet, ChevronLeft, type LucideIcon } from 'lucide-react';

export function NetWorthShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-5">
        {children}
      </div>
    </div>
  );
}

const TABS = [
  { href: '/personal/networth', label: 'Overview' },
  { href: '/personal/networth/liabilities', label: 'Liabilities' },
  { href: '/personal/networth/assets', label: 'Assets' },
  { href: '/personal/networth/recurring', label: 'Recurring' },
  { href: '/personal/networth/reports', label: 'Reports' },
  { href: '/personal/networth/setup', label: 'Setup' },
];

export function NetWorthHeader({
  eyebrow, title, subtitle, icon = Wallet,
}: { eyebrow?: string; title: string; subtitle?: string; icon?: LucideIcon }) {
  const Icon = icon;
  const pathname = usePathname();
  const isActive = (href: string) => href === '/personal/networth'
    ? pathname === '/personal/networth'
    : pathname?.startsWith(href);
  return (
    <header className="flex flex-col gap-4">
      <Link
        href="/personal"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-700 dark:hover:text-indigo-300 self-start"
      >
        <ChevronLeft size={16} />
        Back to Personal
      </Link>
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950 inline-flex items-center justify-center">
          <Icon size={28} className="text-indigo-700 dark:text-indigo-300" />
        </div>
        <div>
          {eyebrow && <div className="text-xs uppercase tracking-wider text-slate-500">{eyebrow}</div>}
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-50">{title}</h1>
          {subtitle && <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{subtitle}</p>}
        </div>
      </div>
      <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        {TABS.map(t => (
          <Link key={t.href} href={t.href}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition ${
              isActive(t.href)
                ? 'border-indigo-500 text-indigo-700 dark:text-indigo-300'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
            }`}>
            {t.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
