'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, Building2, Pencil, BookOpen, Upload, TrendingUp, FileText, Scale, Settings } from 'lucide-react';

const TABS = [
  { id: 'overview',  label: 'Overview',     href: '/fmplus/financial/budget',          Icon: BarChart3,   match: (p: string) => p === '/fmplus/financial/budget' },
  { id: 'projects',  label: 'Project Hub',  href: '/fmplus/financial/budget/projects', Icon: Building2,   match: (p: string) => p.startsWith('/fmplus/financial/budget/projects') },
  { id: 'edit',      label: 'Editor',       href: '/fmplus/financial/budget/edit',     Icon: Pencil,      match: (p: string) => p.startsWith('/fmplus/financial/budget/edit') },
  { id: 'catalog',   label: 'Catalog',      href: '/fmplus/financial/budget/catalog',  Icon: BookOpen,    match: (p: string) => p.startsWith('/fmplus/financial/budget/catalog') },
  { id: 'import',    label: 'Import',       href: '/fmplus/financial/budget/import',   Icon: Upload,      match: (p: string) => p.startsWith('/fmplus/financial/budget/import') },
  { id: 'variance',  label: 'Variance',     href: '/fmplus/financial/budget/variance', Icon: TrendingUp,  match: (p: string) => p.startsWith('/fmplus/financial/budget/variance') },
  { id: 'report',    label: 'Report',       href: '/fmplus/financial/budget/report',   Icon: FileText,    match: (p: string) => p.startsWith('/fmplus/financial/budget/report') },
  { id: 'compare',   label: 'Compare',      href: '/fmplus/financial/budget/compare',  Icon: Scale,       match: (p: string) => p.startsWith('/fmplus/financial/budget/compare') },
  { id: 'settings',  label: 'Settings',     href: '/fmplus/financial/budget/settings', Icon: Settings,    match: (p: string) => p.startsWith('/fmplus/financial/budget/settings') },
] as const;

export function BudgetTabStrip() {
  const pathname = usePathname() ?? '';
  return (
    <nav className="border-b border-slate-200 dark:border-slate-700 flex gap-1 -mt-2 overflow-x-auto">
      {TABS.map(t => {
        const active = t.match(pathname);
        return (
          <Link
            key={t.id}
            href={t.href}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition flex items-center gap-1.5 whitespace-nowrap ${
              active
                ? 'border-fmplus-yellow text-fmplus-gold dark:text-fmplus-yellow'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            <t.Icon size={14} />
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
