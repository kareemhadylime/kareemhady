// src/app/beithady/hr/training/page.tsx
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import {
  getExpiringTrainingRecords,
  getAllEmployeeTrainingSummary,
} from '@/lib/beithady/hr/hr-training-queries';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { TrainingExpiryBanner }  from './_components/training-expiry-banner';
import { EmployeeTrainingList }  from './_components/employee-training-list';

export const dynamic = 'force-dynamic';

export default async function TrainingPage() {
  const { roles } = await requireBeithadyPermission('hr', 'read');
  const canManage = roles.some(r => r === 'admin' || r === 'manager');

  const [expiringRecords, summary] = await Promise.all([
    getExpiringTrainingRecords(60),
    getAllEmployeeTrainingSummary(),
  ]);

  const employees = summary.map(e => ({
    id:           e.employee_id,
    company_id:   e.company_id,
    display_name: e.employee_name,
  }));

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'People', href: '/beithady/hr' },
        { label: 'Training & Certifications' },
      ]}
      containerClass="max-w-5xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · People"
        title="Training & Certifications"
        subtitle="Training records · certifications · expiry tracking per employee"
      />
      <div className="space-y-6">
        <TrainingExpiryBanner records={expiringRecords} />
        <EmployeeTrainingList
          initialSummary={summary}
          employees={employees}
          canManage={canManage}
          onRefresh={() => {}}
        />
      </div>
    </BeithadyShell>
  );
}
