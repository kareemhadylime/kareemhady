import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { listLeaveRequests, listLeaveBalances } from '@/lib/beithady/hr/hr-leave-ot-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const year        = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()), 10);
  const employee_id = searchParams.get('employee_id') ?? undefined;

  const [pending, balances] = await Promise.all([
    listLeaveRequests({ status: 'pending', year, employee_id }),
    listLeaveBalances(year),
  ]);

  return NextResponse.json({ pending, balances });
}
