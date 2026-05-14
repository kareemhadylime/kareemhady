import { type NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getHeadcountHistory } from '@/lib/beithady/hr/hr-headcount-queries';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const from          = searchParams.get('from')       ?? undefined;
  const to            = searchParams.get('to')         ?? undefined;
  const building_code = searchParams.get('building')   ?? undefined;
  const department    = searchParams.get('department') ?? undefined;

  const rows = await getHeadcountHistory({ from, to, building_code, department });
  return NextResponse.json({ rows });
}
