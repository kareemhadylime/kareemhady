import Link from 'next/link';

const TABS = [
  { id: 'accounts', label: 'Accounts' },
  { id: 'categories', label: 'Categories' },
  { id: 'rules', label: 'Rules' },
  { id: 'ai', label: 'AI' },
  { id: 'corrections', label: 'Corrections' },
] as const;

export type SetupTabId = typeof TABS[number]['id'];

export function SetupTabs({ activeTab }: { activeTab: SetupTabId }) {
  return (
    <nav className="border-b border-slate-200 -mb-px flex gap-1 overflow-x-auto">
      {TABS.map(t => (
        <Link
          key={t.id}
          href={`/personal/email/setup/${t.id}`}
          className={`px-4 py-2 text-sm border-b-2 -mb-px transition ${
            activeTab === t.id
              ? 'border-slate-900 text-slate-900 font-semibold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
