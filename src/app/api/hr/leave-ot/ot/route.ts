import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listOvertimeRecords } from '@/lib/beithady/hr/hr-leave-ot-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const month       = searchParams.get('month') ?? undefined;
  const employee_id = searchParams.get('employee_id') ?? undefined;

  const [pending, approved] = await Promise.all([
    listOvertimeRecords({ status: 'pending', month, employee_id }),
    listOvertimeRecords({ status: 'approved', month, employee_id }),
  ]);

  return NextResponse.json({ pending, approved });
}
