import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import Link from 'next/link';
import { BilingualToggle } from './_components/bilingual-toggle';

export default async function BudgetLayout({ children }: { children: React.ReactNode }) {
  const user = await requireBudgetView();

  const tabs: Array<[label: string, href: string]> = [
    ['Overview',     '/fmplus/financial/budget'],
    ['Project Hub',  '/fmplus/financial/budget/projects'],
    ['Editor',       '/fmplus/financial/budget/edit'],
    ['Catalog',      '/fmplus/financial/budget/catalog'],
    ['Import',       '/fmplus/financial/budget/import'],
    ['Variance',     '/fmplus/financial/budget/variance'],
    ['Compare',      '/fmplus/financial/budget/compare'],
    ['Settings',     '/fmplus/financial/budget/settings'],
  ];

  return (
    <div>
      <header className="border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-3 flex justify-between items-center">
        <div>
          <h1 className="text-base font-semibold text-slate-900 dark:text-slate-100">FM+ Project Budget</h1>
          <div className="text-xs text-slate-500 dark:text-slate-400">v2 — multi-year · multi-service · catalog-driven · {user.username ?? 'admin'}</div>
        </div>
        <BilingualToggle />
      </header>
      <nav className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-6 flex gap-1 overflow-x-auto">
        {tabs.map(([label, href]) => (
          <Link key={href} href={href}
            className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-t-md whitespace-nowrap">
            {label}
          </Link>
        ))}
      </nav>
      <main className="p-6">{children}</main>
    </div>
  );
}
