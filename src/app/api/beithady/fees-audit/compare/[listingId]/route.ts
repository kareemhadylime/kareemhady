import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { quoteStay } from '@/lib/beithady/fees-audit/quote-calculator';
import type { ChannelBucket } from '@/lib/beithady/guesty-metrics';

export const runtime = 'nodejs';

const ALL_CHANNELS: ChannelBucket[] = ['airbnb', 'booking_com', 'other_ota', 'manual'];

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
  const dateIso = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  const nights = Number(url.searchParams.get('nights') || '3');
  const guests = Number(url.searchParams.get('guests') || '2');

  const out = [] as Array<{
    channel: ChannelBucket;
    breakdown: import('@/lib/beithady/fees-audit/types').FeeBreakdown;
  }>;
  for (const ch of ALL_CHANNELS) {
    try {
      const breakdown = await quoteStay({ listingId, channel: ch, dateIso, nights, guests });
      out.push({ channel: ch, breakdown });
    } catch {
      // skip
    }
  }
  return NextResponse.json({ listingId, dateIso, nights, guests, channels: out });
}
