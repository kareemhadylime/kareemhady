import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { quoteStay, type QuoteInput } from '@/lib/beithady/fees-audit/quote-calculator';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await hasBeithadyPermission(user, 'analytics', 'read'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const body = (await req.json()) as QuoteInput;
  if (!body.listingId || !body.channel || !body.dateIso || !body.nights || !body.guests) {
    return NextResponse.json({ error: 'missing fields' }, { status: 400 });
  }
  const breakdown = await quoteStay(body);
  return NextResponse.json({ breakdown });
}
