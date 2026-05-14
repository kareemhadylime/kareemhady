import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listSalaryAccessUsers } from '@/lib/beithady/hr/hr-salary-access-queries';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { SalaryAccessBoard } from './_components/salary-access-board';

export const dynamic = 'force-dynamic';

export default async function SalaryAccessPage() {
  await requireBeithadyPermission('hr', 'full');
  const users = await listSalaryAccessUsers();
  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'People', href: '/beithady/hr' },
        { label: 'Salary Access' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · People"
        title="Salary Access"
        subtitle="Assign salary visibility tiers to dashboard users · changes take effect in the next sprint"
      />
      <SalaryAccessBoard initialUsers={users} />
    </BeithadyShell>
  );
}
