import { NetWorthShell, NetWorthHeader } from './_components/networth-shell';
import { HeroKpi } from './_components/overview/hero-kpi';
import { TotalsRow } from './_components/overview/totals-row';
import { AssetMixDonut } from './_components/overview/asset-mix-donut';
import { LiabilityMixDonut } from './_components/overview/liability-mix-donut';
import { UpcomingPayments } from './_components/overview/upcoming-payments';
import { CharityYtd } from './_components/overview/charity-ytd';
import { LoanPayoff } from './_components/overview/loan-payoff';
import { QuickEntryStrip } from './_components/overview/quick-entry-strip';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import {
  getOverviewKpis,
  getAssetMix,
  getLiabilityMix,
  getUpcomingPayments,
  getCharityYtd,
} from '@/lib/personal/networth/queries';
import { listSnapshotsForChart } from '@/lib/personal/networth/snapshot';

export const dynamic = 'force-dynamic';

type LoanSummary = {
  liability_id: string;
  name: string;
  remaining_months: number;
  final_due_date: string;
};

export default async function NetWorthOverviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.is_admin) notFound();
  const sb = supabaseAdmin();

  const [
    kpis,
    snapshots,
    assetMix,
    liabilityMix,
    upcoming,
    charity,
    loansRes,
    liabilitiesRes,
    lendersRes,
  ] = await Promise.all([
    getOverviewKpis(user.id),
    listSnapshotsForChart(user.id, 12),
    getAssetMix(user.id),
    getLiabilityMix(user.id),
    getUpcomingPayments(user.id, 30),
    getCharityYtd(user.id),
    sb
      .from('v_personal_networth_loan_summary')
      .select('*')
      .eq('app_user_id', user.id)
      .order('remaining_months', { ascending: true })
      .limit(3),
    sb
      .from('personal_networth_liabilities')
      .select('id, name, kind')
      .eq('app_user_id', user.id)
      .eq('active', true)
      .order('name'),
    sb
      .from('personal_networth_lenders')
      .select('id, name, kind')
      .eq('app_user_id', user.id)
      .order('name'),
  ]);

  if (loansRes.error) {
    throw new Error(`loan summaries fetch failed: ${loansRes.error.message}`);
  }

  return (
    <NetWorthShell>
      <NetWorthHeader
        eyebrow="Subsidiary cockpit"
        title="Net Worth"
        subtitle="Assets, liabilities, recurring payments, monthly report, and historical net-worth chart."
      />
      <HeroKpi kpis={kpis} snapshots={snapshots} />
      <TotalsRow kpis={kpis} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <AssetMixDonut slices={assetMix} />
        <LiabilityMixDonut slices={liabilityMix} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-3">
        <UpcomingPayments rows={upcoming} />
        <div className="space-y-3">
          <CharityYtd charity={charity} />
          <LoanPayoff loans={(loansRes.data ?? []) as LoanSummary[]} />
        </div>
      </div>
      <QuickEntryStrip
        liabilities={liabilitiesRes.data ?? []}
        lenders={lendersRes.data ?? []}
      />
    </NetWorthShell>
  );
}
