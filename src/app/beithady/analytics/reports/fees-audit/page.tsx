import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { FeeAuditDashboard } from './_components/FeeAuditDashboard';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

export default async function FeesAuditPage() {
  await requireBeithadyPermission('analytics', 'read');

  const today = new Date().toISOString().slice(0, 10);

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Analytics', href: '/beithady/analytics' },
        { label: 'Generate Report', href: '/beithady/analytics/reports' },
        { label: 'Fees Audit' },
      ]}
      containerClass="max-w-[1600px]"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Fees Audit"
        title="Booking-Channel Fee Audit"
        subtitle="Forward 7/14/30 day audit of every fee, tax, and stay-rule charged to guests across Airbnb, Booking, Other OTA, and Manual channels. Cross-references to bedrooms × bathrooms · all in USD."
      />
      <FeeAuditDashboard initialStartDate={today} />
    </BeithadyShell>
  );
}
