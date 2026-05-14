// src/app/api/hr/attendance/day-view/route.ts
import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getAttendanceDayView } from '@/lib/beithady/hr/hr-attendance-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const date       = searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  const building   = searchParams.get('building') ?? undefined;
  const department = searchParams.get('department') ?? undefined;

  const rows = await getAttendanceDayView(date, { building, department });
  return NextResponse.json({ rows });
}
