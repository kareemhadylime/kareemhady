import { NetWorthShell, NetWorthHeader } from '../_components/networth-shell';
import { AssetTable } from '../_components/assets/asset-table';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function AssetsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.is_admin) notFound();

  const sb = supabaseAdmin();
  const [assetsRes, currentRes] = await Promise.all([
    sb
      .from('personal_networth_assets')
      .select('*')
      .eq('app_user_id', user.id)
      .eq('active', true)
      .order('balance', { ascending: false }),
    sb
      .from('v_personal_networth_current')
      .select('stocks_pipe_egp')
      .eq('app_user_id', user.id)
      .maybeSingle(),
  ]);

  return (
    <NetWorthShell>
      <NetWorthHeader
        eyebrow="Net Worth"
        title="Assets"
        subtitle="Cash, real estate, vehicles, gold/jewelry. Stocks pipe in from /personal/stocks."
      />
      <AssetTable
        assets={assetsRes.data ?? []}
        stocksPipeEgp={Number(currentRes.data?.stocks_pipe_egp ?? 0)}
      />
    </NetWorthShell>
  );
}
