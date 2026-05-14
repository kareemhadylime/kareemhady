// src/app/beithady/hr/attendance/page.tsx
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { getAttendanceDayView } from '@/lib/beithady/hr/hr-attendance-queries';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { AttendanceBoard } from './_components/attendance-board';

export const dynamic = 'force-dynamic';

export default async function AttendancePage() {
  const { roles } = await requireBeithadyPermission('hr', 'read');
  const canApprove = roles.some(r => r === 'admin' || r === 'manager');

  const today = new Date().toISOString().slice(0, 10);
  const initialRows = await getAttendanceDayView(today, {});

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'People', href: '/beithady/hr' },
        { label: 'Daily Attendance' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · People"
        title="Daily Attendance"
        subtitle="Download template · import roll call · approve records"
      />
      <AttendanceBoard
        initialRows={initialRows}
        initialDate={today}
        canApprove={canApprove}
      />
    </BeithadyShell>
  );
}
