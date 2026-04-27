import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { listGuests, type GuestListFilter, type GuestListSort } from '@/lib/beithady/crm/guest-list';
import { rowsToCsv } from '@/lib/beithady/crm/segments';
import type { LoyaltyTier } from '@/lib/beithady/crm/loyalty';

// Server-rendered CSV download. Honors the same filter querystring as
// /emails/beithady/crm so the "Download CSV" button on the list page
// just links here with the current params.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VALID_TIERS = ['none', 'bronze', 'silver', 'gold', 'platinum'] as const satisfies readonly LoyaltyTier[];
const VALID_SORTS = [
  'last_seen_desc',
  'next_arrival_asc',
  'lifetime_stays_desc',
  'lifetime_spend_desc',
  'name_asc',
] as const;

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const ok = user.is_admin || (await hasBeithadyPermission(user, 'crm', 'read'));
  if (!ok) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const sp = url.searchParams;
  const filter: GuestListFilter = {};
  const q = sp.get('q');
  if (q) filter.search = q;
  const country = sp.get('country');
  if (country) filter.countries = country.split(',').filter(Boolean);
  const tiers = sp.getAll('tier').filter((t): t is LoyaltyTier => (VALID_TIERS as readonly string[]).includes(t));
  if (tiers.length) filter.tiers = tiers;
  if (sp.get('vip') === '1') filter.vipOnly = true;
  if (sp.get('future') === '1') filter.hasFutureBooking = true;
  if (sp.get('hasConv') === '1') filter.hasConversation = true;
  const ms = parseInt(sp.get('minStays') || '', 10);
  if (Number.isFinite(ms) && ms > 0) filter.minStays = ms;

  const sortRaw = sp.get('sort') || 'last_seen_desc';
  const sort = (VALID_SORTS as readonly string[]).includes(sortRaw)
    ? (sortRaw as GuestListSort)
    : 'last_seen_desc';

  // Pull up to 5000 rows in one shot. Beithady's full guest base is well
  // under that today; if we need bigger we'll page + concatenate.
  const result = await listGuests({ filter, sort, page: 1, pageSize: 5000 });
  const csv = rowsToCsv(result.rows);

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="beithady-guests-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
