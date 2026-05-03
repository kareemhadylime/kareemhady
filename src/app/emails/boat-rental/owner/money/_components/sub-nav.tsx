import Link from 'next/link';

const TABS = [
  { href: '/emails/boat-rental/owner/money', label: 'Overview' },
  { href: '/emails/boat-rental/owner/money/expenses', label: 'Expenses' },
  { href: '/emails/boat-rental/owner/money/bills', label: 'Bills' },
  { href: '/emails/boat-rental/owner/money/recurring', label: 'Recurring' },
];

export function MoneySubNav({ current }: { current: string }) {
  return (
    <nav className="flex gap-1 border-b border-slate-200 dark:border-slate-700 mt-6 mb-6 overflow-x-auto">
      {TABS.map((t) => {
        const active = current === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 ${
              active
                ? 'border-cyan-600 text-cyan-700 dark:text-cyan-300 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
