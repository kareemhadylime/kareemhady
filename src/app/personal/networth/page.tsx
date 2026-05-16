import { NetWorthShell, NetWorthHeader } from './_components/networth-shell';
import { HeroKpi } from './_components/overview/hero-kpi';
import { TotalsRow } from './_components/overview/totals-row';
import { getCurrentUser } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { getOverviewKpis } from '@/lib/personal/networth/queries';
import { listSnapshotsForChart } from '@/lib/personal/networth/snapshot';
import { Wallet } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function NetWorthOverviewPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.is_admin) notFound();

  const [kpis, snapshots] = await Promise.all([
    getOverviewKpis(user.id),
    listSnapshotsForChart(user.id, 12),
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
    </NetWorthShell>
  );
}
