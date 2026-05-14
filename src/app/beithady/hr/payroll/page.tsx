// src/app/beithady/hr/payroll/page.tsx
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listPayrollMonths, getMonthEntries } from '@/lib/beithady/hr/hr-payroll-queries';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { PayrollRoster } from './_components/payroll-roster';

export const dynamic = 'force-dynamic';

export default async function PayrollPage() {
  await requireBeithadyPermission('hr', 'read');
  const months = await listPayrollMonths();
  const latestMonth = months[0] ?? null;
  const initialEntries = latestMonth
    ? await getMonthEntries(latestMonth.id, { exclude_terminated: false })
    : [];
  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'People', href: '/beithady/hr' },
        { label: 'Monthly Payroll' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · People"
        title="Monthly Payroll"
        subtitle="Upload monthly salary sheet · print bilingual payslips · batch by building"
      />
      <PayrollRoster
        months={months}
        initialMonthId={latestMonth?.id ?? null}
        initialEntries={initialEntries}
      />
    </BeithadyShell>
  );
}
