import { NetWorthShell, NetWorthHeader } from './_components/networth-shell';
import { HeroKpi } from './_components/overview/hero-kpi';
import { TotalsRow } from './_components/overview/totals-row';
import { AssetMixDonut } from './_components/overview/asset-mix-donut';
import { LiabilityMixDonut } from './_components/overview/liability-mix-donut';
import { UpcomingPayments } from './_components/overview/upcoming-payments';
import { getCurrentUser } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import {
  getOverviewKpis, getAssetMix, getLiabilityMix, getUpcomingPayments,
} from '@/lib/personal/networth/queries';
import { listSnapshotsForChart } from '@/lib/personal/networth/snapshot';
import { Wallet } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function NetWorthOverviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.is_admin) notFound();

  const [kpis, snapshots, assetMix, liabilityMix, upcoming] = await Promise.all([
    getOverviewKpis(user.id),
    listSnapshotsForChart(user.id, 12),
    getAssetMix(user.id),
    getLiabilityMix(user.id),
    getUpcomingPayments(user.id, 30),
  ]);

  return (
    <NetWorthShell>
      <NetWorthHeader
        eyebrow="Subsidiary cockpit"
        title="Net Worth"
        subtitle="Assets, liabilities, recurring payments, monthly report, and historical net-worth chart."
        icon={Wallet}
      />
      <HeroKpi kpis={kpis} snapshots={snapshots} />
      <TotalsRow kpis={kpis} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <AssetMixDonut slices={assetMix} />
        <LiabilityMixDonut slices={liabilityMix} />
      </div>
      <UpcomingPayments rows={upcoming} />
    </NetWorthShell>
  );
}
