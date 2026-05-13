import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { HCTabs } from '../_components/hc-tabs';

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
        subtitle="Define security posts per building to calculate required headcount."
      />
      <HCTabs />
      <p className="text-slate-500 text-sm">Security calculator coming soon…</p>
    </BeithadyShell>
  );
}
