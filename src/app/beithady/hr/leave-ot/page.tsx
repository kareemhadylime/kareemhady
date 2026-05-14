import { requireBeithadyPermission } from '@/lib/beithady/auth';
import {
  listLeaveRequests,
  listLeaveBalances,
  listOvertimeRecords,
  listActiveEmployeesSimple,
} from '@/lib/beithady/hr/hr-leave-ot-queries';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { LeaveOtBoard } from './_components/leave-ot-board';

export const dynamic = 'force-dynamic';

export default async function LeaveOtPage() {
  const { roles } = await requireBeithadyPermission('hr', 'read');
  const canApprove = roles.some(r => r === 'admin' || r === 'manager');

  const currentYear  = new Date().getFullYear();
  const currentMonth = new Date().toISOString().slice(0, 7);

  const [pendingLeave, balances, pendingOT, approvedOT, employees] = await Promise.all([
    listLeaveRequests({ status: 'pending', year: currentYear }),
    listLeaveBalances(currentYear),
    listOvertimeRecords({ status: 'pending', month: currentMonth }),
    listOvertimeRecords({ status: 'approved', month: currentMonth }),
    listActiveEmployeesSimple(),
  ]);

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'People', href: '/beithady/hr' },
        { label: 'Leave & Overtime' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · People"
        title="Leave & Overtime"
        subtitle="Leave requests · balance tracking · overtime logging · approvals"
      />
      <LeaveOtBoard
        initialPendingLeave={pendingLeave}
        initialBalances={balances}
        initialPendingOT={pendingOT}
        initialApprovedOT={approvedOT}
        employees={employees}
        canApprove={canApprove}
      />
    </BeithadyShell>
  );
}
