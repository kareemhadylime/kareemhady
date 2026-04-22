import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import {
  ChevronRight,
  Users,
  Cable,
  Mail,
  ListChecks,
  Cog,
} from 'lucide-react';
import { TopNav } from '../_components/brand';
import { getCurrentUser } from '@/lib/auth';
import { SetupTabs } from './_components/setup-tabs';

export const dynamic = 'force-dynamic';

const MODULES: Array<{
  title: string;
  description: string;
  href: string;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
  accent: string;
}> = [
  {
    title: 'Users & Roles',
    description:
      'Create accounts, rotate roles (admin / editor / viewer), and grant per-subsidiary domain access.',
    href: '/admin/users',
    Icon: Users,
    accent: 'bg-lime-50 text-lime-700 ring-lime-200',
  },
  {
    title: 'API Setup',
    description:
      'Configure credentials for Odoo, Guesty, PriceLabs, Shopify, and other integrations. Test connections inline.',
    href: '/admin/integrations',
    Icon: Cable,
    accent: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  },
  {
    title: 'Email Accounts',
    description:
      'Gmail mailboxes connected for ingestion. View last-24h runs and OAuth token status.',
    href: '/admin/accounts',
    Icon: Mail,
    accent: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
  {
    title: 'Email Rules',
    description:
      'Filter incoming emails and route them to structured rule outputs per domain.',
    href: '/admin/rules',
    Icon: ListChecks,
    accent: 'bg-violet-50 text-violet-700 ring-violet-200',
  },
];

export default async function AdminHome() {
  const me = await getCurrentUser();
  if (!me) redirect('/login?next=/admin');
  if (!me.is_admin) notFound();

  return (
    <>
      <TopNav>
        <Link href="/" className="ix-link">Home</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Setup</span>
      </TopNav>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8 flex-1">
        <header className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
              Admin · Setup
            </p>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Cog size={26} className="text-lime-600" />
              Setup
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Account, integration, and rules configuration. Pick a tab below
              or jump straight to a module.
            </p>
          </div>
        </header>

        <SetupTabs activeTab="overview" />

        <section className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-4">
          {MODULES.map(m => (
            <Link
              key={m.href}
              href={m.href}
              className="group ix-card p-5 space-y-3 hover:shadow-md hover:-translate-y-0.5 transition"
            >
              <div
                className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ring-1 ${m.accent}`}
              >
                <m.Icon size={20} />
              </div>
              <div>
                <h3 className="text-base font-semibold tracking-tight">
                  {m.title}
                </h3>
                <p className="text-sm text-slate-500 mt-1">{m.description}</p>
              </div>
              <p className="text-[11px] text-slate-400 group-hover:text-lime-700 transition">
                Open →
              </p>
            </Link>
          ))}
        </section>
      </main>
    </>
  );
}
