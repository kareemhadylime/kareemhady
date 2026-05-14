// src/app/api/hr/payroll-entries/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getMonthEntries } from '@/lib/beithady/hr/hr-payroll-queries';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const monthId = req.nextUrl.searchParams.get('monthId');
  if (!monthId) return NextResponse.json({ error: 'monthId required' }, { status: 400 });

  const entries = await getMonthEntries(monthId, { exclude_terminated: false });
  return NextResponse.json({ entries });
}
