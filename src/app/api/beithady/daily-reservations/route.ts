import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { isExcludedFromReport } from '@/lib/beithady-daily-report/units';

// GET /api/beithady/daily-reservations?date=YYYY-MM-DD&view=arrivals|departures|turnovers|inhouse&building=all|BH-26|...
//
// Powers the ActivityDrawer popout on the Daily Activity tiles.
// Returns reservation detail rows for the given date + view, filtered
// by building when specified. Honors the BH-DXB Egypt-only exclusion.

const ACTIVE_STATUSES = ['confirmed', 'checked_in', 'checked_out'];
const KNOWN_BUILDINGS = new Set(['BH-26', 'BH-73', 'BH-435', 'BH-OK']);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get('date');
  const view = searchParams.get('view');
  const building = searchParams.get('building') ?? 'all';

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'invalid_date' }, { status: 400 });
  }
  if (!['arrivals', 'departures', 'turnovers', 'inhouse'].includes(view ?? '')) {
    return NextResponse.json({ error: 'invalid_view' }, { status: 400 });
  }

  const sb = supabaseAdmin();

  // Build the query — fetch a wider window for turnovers (need both legs).
  let query = sb
    .from('guesty_reservations')
    .select(
      `id, confirmation_code, guest_name, listing_id, listing_nickname,
       check_in_date, check_out_date, nights, guests, source, status,
       listing:guesty_listings!left(building_code)`,
    )
    .in('status', ACTIVE_STATUSES)
    .order('listing_nickname', { ascending: true })
    .limit(200);

  if (view === 'arrivals') {
    query = query.eq('check_in_date', date);
  } else if (view === 'departures') {
    query = query.eq('check_out_date', date);
  } else if (view === 'turnovers') {
    // Fetch any reservation touching today — filter to turnover listings below.
    query = query.or(`check_in_date.eq.${date},check_out_date.eq.${date}`);
  } else {
    // inhouse: check_in_date <= date AND check_out_date >= date
    query = query.lte('check_in_date', date).gte('check_out_date', date);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[daily-reservations] query error:', error.message);
    return NextResponse.json({ error: 'database_error' }, { status: 500 });
  }

  type ResRow = {
    id: string;
    confirmation_code: string | null;
    guest_name: string | null;
    listing_id: string | null;
    listing_nickname: string | null;
    check_in_date: string | null;
    check_out_date: string | null;
    nights: number | null;
    guests: number | null;
    source: string | null;
    status: string | null;
    listing: { building_code: string | null } | null;
  };

  let rows = ((data as unknown as ResRow[]) ?? []).filter((r) => {
    const bc = r.listing?.building_code ?? null;
    return !isExcludedFromReport(bc);
  });

  // For turnovers: only keep listings that have BOTH a checkout AND a
  // check-in on this date (same listing_id). Return all reservations for
  // those listings so the drawer can show departing + arriving guest.
  if (view === 'turnovers') {
    const checkouts = new Set(rows.filter((r) => r.check_out_date === date).map((r) => r.listing_id));
    const checkins = new Set(rows.filter((r) => r.check_in_date === date).map((r) => r.listing_id));
    const turnoverListings = new Set([...checkouts].filter((id) => id && checkins.has(id)));
    rows = rows.filter((r) => r.listing_id && turnoverListings.has(r.listing_id));
  }

  // Building filter (post-fetch — row set is small, no SQL join filter needed)
  if (building !== 'all') {
    rows = rows.filter((r) => {
      const bc = r.listing?.building_code ?? null;
      if (building === 'OTHER') return bc === null || !KNOWN_BUILDINGS.has(bc);
      return bc === building;
    });
  }

  const reservations = rows.map((r) => ({
    id: r.id,
    confirmation_code: r.confirmation_code,
    guest_name: r.guest_name,
    listing_id: r.listing_id,
    listing_nickname: r.listing_nickname,
    building_code: r.listing?.building_code ?? null,
    check_in_date: r.check_in_date,
    check_out_date: r.check_out_date,
    nights: r.nights,
    guests: r.guests,
    source: r.source,
    status: r.status,
  }));

  return NextResponse.json({ reservations, date, view, building });
}
