import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { HCTabs } from './_components/hc-tabs';
import { HKCalculator } from './_components/hk-calculator';
import { fetchHKBaseData } from '@/lib/beithady/hc-estimator';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export default async function HKPage() {
  await requireBeithadyPermission('analytics', 'read');
  const baseData = await fetchHKBaseData();

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Analytics', href: '/beithady/analytics' },
        { label: 'Head Count Estimator' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Analytics"
        title="Head Count Estimator"
        subtitle={`Based on ${baseData.month} actuals — adjust multiplier to project forward.`}
      />
      <HCTabs />
      <HKCalculator base={baseData} />
    </BeithadyShell>
  );
}
