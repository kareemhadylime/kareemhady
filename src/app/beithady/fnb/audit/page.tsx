import 'server-only';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { AuditList } from './_components/audit-list';

export const dynamic = 'force-dynamic';

export default async function AuditPage() {
  const { roles, user } = await requireBeithadyPermission('fnb', 'read');
  const showPayloads = roles.some(r => ['admin','manager','fnb_manager'].includes(r)) || user.is_admin;
  return (
    <div className="ix-card p-4">
      <h2 className="text-lg font-semibold mb-3">Audit log</h2>
      <p className="text-xs text-slate-500 mb-3">
        All F&B mutations from <code>beithady_audit_log</code> (module = &apos;fnb&apos;).
      </p>
      <AuditList showPayloads={showPayloads} />
    </div>
  );
}
