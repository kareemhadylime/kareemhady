import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { buildFeeStack } from '@/lib/beithady/fees-audit/build-fee-stack';
import type { FeeAuditConfig } from '@/lib/beithady/fees-audit/types';

export const runtime = 'nodejs';

type VendorKey = 'booking_com' | 'airbnb' | 'vrbo';

const Body = z.object({
  vendor: z.enum(['booking_com', 'airbnb', 'vrbo']),
  config: z.object({
    startDate: z.string().min(8).max(20),
    windowDays: z.number().int().positive().max(366),
  }).passthrough(),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await hasBeithadyPermission(user, 'analytics', 'read'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', issues: parsed.error.issues }, { status: 400 });
  }
  const body = parsed.data as { vendor: VendorKey; config: FeeAuditConfig };

  const data = await buildFeeStack(body.config);

  // Vendor-specific CSV column shapes (best-effort templates).
  const lines: string[] = [];
  if (body.vendor === 'booking_com') {
    lines.push('property_id,date,price_usd,min_los,cleaning_fee_usd,currency');
    for (const d of data.daily) {
      const l = data.listings.find(x => x.id === d.listing_id);
      const ch = d.per_channel.find(c => c.channel === 'booking_com');
      lines.push([
        l?.nickname || d.listing_id,
        d.date,
        ch?.guest_gross_usd?.toFixed(2) || '',
        l?.min_nights_per_channel?.['booking_com'] || l?.min_nights_default || '',
        l?.cleaning_fee || '',
        'USD',
      ].join(','));
    }
  } else if (body.vendor === 'airbnb') {
    lines.push('listing_id,date,nightly_rate_usd,min_nights,cleaning_fee_usd');
    for (const d of data.daily) {
      const l = data.listings.find(x => x.id === d.listing_id);
      lines.push([
        l?.nickname || d.listing_id,
        d.date,
        d.base_price_usd?.toFixed(2) || '',
        l?.min_nights_per_channel?.['airbnb'] || l?.min_nights_default || '',
        l?.cleaning_fee || '',
      ].join(','));
    }
  } else {
    lines.push('property_id,date,nightly_rate_usd,min_stay,cleaning_fee_usd');
    for (const d of data.daily) {
      const l = data.listings.find(x => x.id === d.listing_id);
      lines.push([
        l?.nickname || d.listing_id,
        d.date,
        d.base_price_usd?.toFixed(2) || '',
        l?.min_nights_default || '',
        l?.cleaning_fee || '',
      ].join(','));
    }
  }

  const csv = lines.join('\n');
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="fee-audit-${body.vendor}-${data.config.startDate}.csv"`,
    },
  });
}
