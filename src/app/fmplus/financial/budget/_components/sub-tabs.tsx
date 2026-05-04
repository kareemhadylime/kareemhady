// @ts-nocheck — v1 orphan; route gets rewritten in Tasks 17-39 of fmplus-budget-v2 plan
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Pencil, Upload, BarChart3, GitCompareArrows, Settings } from 'lucide-react';

const TABS = [
  { href: '/fmplus/financial/budget',          label: 'Overview',  Icon: LayoutDashboard,    exact: true },
  { href: '/fmplus/financial/budget/edit',     label: 'Editor',    Icon: Pencil,             exact: false },
  { href: '/fmplus/financial/budget/import',   label: 'Import',    Icon: Upload,             exact: false },
  { href: '/fmplus/financial/budget/variance', label: 'Variance',  Icon: BarChart3,          exact: false },
  { href: '/fmplus/financial/budget/compare',  label: 'Compare',   Icon: GitCompareArrows,   exact: false },
  { href: '/fmplus/financial/budget/settings', label: 'Settings',  Icon: Settings,           exact: false },
];

export function SubTabs() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
      {TABS.map(t => {
        const active = t.exact ? path === t.href : path.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            className={
              'flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ' +
              (active
                ? 'border-amber-600 text-amber-700 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300')
            }
          >
            <t.Icon size={14} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
