import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getMonthlyAvgHeadcount } from '@/lib/beithady/hr/hr-headcount-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const month = request.nextUrl.searchParams.get('month')
    ?? new Date().toISOString().slice(0, 7);

  const result = await getMonthlyAvgHeadcount(month);
  return NextResponse.json(result);
}
