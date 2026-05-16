import { NetWorthShell, NetWorthHeader } from '../_components/networth-shell';
import { TemplatesTab } from '../_components/recurring/templates-tab';
import { PaymentLogTab } from '../_components/recurring/payment-log-tab';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function RecurringPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.is_admin) notFound();

  const sp = await searchParams;
  const tab = sp.tab === 'log' ? 'log' : 'templates';

  // Liabilities list is needed by the Add Recurring modal so the user
  // can link a "loan_payment" / "card_payment" template to its
  // underlying liability. Only show active liabilities.
  const sb = supabaseAdmin();
  const { data: liabilities } = await sb
    .from('personal_networth_liabilities')
    .select('id, name, kind')
    .eq('app_user_id', user.id)
    .eq('active', true)
    .order('name');

  return (
    <NetWorthShell>
      <NetWorthHeader
        eyebrow="Net Worth"
        title="Recurring"
        subtitle="Charity, rent, utilities, subscriptions, loan auto-payments."
      />
      <TabSwitcher current={tab} />
      {tab === 'templates' ? (
        <TemplatesTab liabilities={liabilities ?? []} />
      ) : (
        <PaymentLogTab />
      )}
    </NetWorthShell>
  );
}

function TabSwitcher({ current }: { current: 'templates' | 'log' }) {
  const link = (key: 'templates' | 'log', label: string) => (
    <a
      key={key}
      href={`?tab=${key}`}
      className={`px-3 py-2 text-sm border-b-2 ${
        current === key
          ? 'border-indigo-500 text-indigo-700 dark:text-indigo-300'
          : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
      }`}
    >
      {label}
    </a>
  );
  return (
    <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
      {link('templates', 'Templates')}
      {link('log', 'Payment Log')}
    </div>
  );
}
