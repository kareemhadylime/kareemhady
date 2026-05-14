// src/app/api/hr/training/by-employee/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getEmployeeTrainingRecords } from '@/lib/beithady/hr/hr-training-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const employee_id = request.nextUrl.searchParams.get('employee_id');
  if (!employee_id) return NextResponse.json({ error: 'employee_id required' }, { status: 400 });

  try {
    const records = await getEmployeeTrainingRecords(employee_id);
    return NextResponse.json({ records });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal error' },
      { status: 500 }
    );
  }
}
