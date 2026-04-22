import Link from 'next/link';
import {
  LayoutGrid,
  Users,
  Cable,
  Mail,
  ListChecks,
} from 'lucide-react';

// Shared tab bar for every /admin/* page. Each page passes `activeTab`
// so the current section is highlighted without a client component.
export type SetupTab =
  | 'overview'
  | 'users'
  | 'integrations'
  | 'accounts'
  | 'rules';

const TABS: Array<{
  id: SetupTab;
  label: string;
  href: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
}> = [
  { id: 'overview', label: 'Overview', href: '/admin', Icon: LayoutGrid },
  { id: 'users', label: 'Users & Roles', href: '/admin/users', Icon: Users },
  {
    id: 'integrations',
    label: 'API Setup',
    href: '/admin/integrations',
    Icon: Cable,
  },
  { id: 'accounts', label: 'Email Accounts', href: '/admin/accounts', Icon: Mail },
  { id: 'rules', label: 'Email Rules', href: '/admin/rules', Icon: ListChecks },
];

export function SetupTabs({ activeTab }: { activeTab: SetupTab }) {
  return (
    <nav
      aria-label="Setup sections"
      className="flex flex-wrap items-center gap-1 border-b border-slate-200 -mb-px"
    >
      {TABS.map(t => {
        const active = t.id === activeTab;
        return (
          <Link
            key={t.id}
            href={t.href}
            className={`inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-t-lg border-b-2 -mb-px transition ${
              active
                ? 'border-lime-600 text-lime-700 bg-lime-50/50'
                : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
            }`}
          >
            <t.Icon size={14} className={active ? 'text-lime-600' : 'text-slate-400'} />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
