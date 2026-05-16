import { NetWorthShell, NetWorthHeader } from '../_components/networth-shell';
import { LiabilityTable } from '../_components/liabilities/liability-table';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function LiabilitiesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.is_admin) notFound();

  const sb = supabaseAdmin();
  const [liabilitiesRes, lendersRes] = await Promise.all([
    sb
      .from('personal_networth_liabilities')
      .select('*, personal_networth_lenders(name)')
      .eq('app_user_id', user.id)
      .eq('active', true)
      .order('current_balance', { ascending: false }),
    sb
      .from('personal_networth_lenders')
      .select('id, name, kind')
      .order('name'),
  ]);

  if (liabilitiesRes.error) {
    throw new Error(`liabilities fetch failed: ${liabilitiesRes.error.message}`);
  }

  return (
    <NetWorthShell>
      <NetWorthHeader
        eyebrow="Net Worth"
        title="Liabilities"
        subtitle="Loans · BNPL · Credit cards · Overdraft."
      />
      <LiabilityTable
        liabilities={liabilitiesRes.data ?? []}
        lenders={lendersRes.data ?? []}
      />
    </NetWorthShell>
  );
}
