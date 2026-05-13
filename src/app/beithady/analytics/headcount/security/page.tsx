import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { HCTabs } from '../_components/hc-tabs';
import { SecurityCalculator } from '../_components/security-calculator';

export const dynamic = 'force-dynamic';

export default async function SecurityPage() {
  await requireBeithadyPermission('analytics', 'read');
  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Analytics', href: '/beithady/analytics' },
        { label: 'Head Count Estimator', href: '/beithady/analytics/headcount' },
        { label: 'Security' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Analytics"
        title="Head Count Estimator"
        subtitle="Define security posts per building — KPI cards update as you type."
      />
      <HCTabs />
      <SecurityCalculator />
    </BeithadyShell>
  );
}
