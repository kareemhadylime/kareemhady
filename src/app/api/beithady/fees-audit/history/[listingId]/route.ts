import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { getFeeHistory } from '@/lib/beithady/fees-audit/fee-history';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ listingId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await hasBeithadyPermission(user, 'analytics', 'read'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { listingId } = await ctx.params;
  const url = new URL(req.url);
  const feeType = url.searchParams.get('feeType') || undefined;
  const history = await getFeeHistory(listingId, feeType);
  return NextResponse.json({ history });
}
