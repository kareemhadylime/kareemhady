import { requireBeithadyPermission } from '@/lib/beithady/auth';
import {
  getExpiringDocuments,
  getAllEmployeeDocSummary,
} from '@/lib/beithady/hr/hr-documents-queries';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { ExpiringBanner } from './_components/expiring-banner';
import { EmployeeDocList } from './_components/employee-doc-list';

export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  const { roles } = await requireBeithadyPermission('hr', 'read');
  const canManage = roles.some(r => r === 'admin' || r === 'manager');

  const [expiringDocs, summary] = await Promise.all([
    getExpiringDocuments(60),
    getAllEmployeeDocSummary(),
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
        { label: 'Documents & Compliance' },
      ]}
      containerClass="max-w-5xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · People"
        title="Documents & Compliance"
        subtitle="Contract files · IDs · police reports · expiry tracking"
      />
      <div className="space-y-6">
        <ExpiringBanner docs={expiringDocs} />
        <EmployeeDocList
          initialSummary={summary}
          employees={employees}
          canManage={canManage}
          onRefresh={() => {}}
        />
      </div>
    </BeithadyShell>
  );
}
