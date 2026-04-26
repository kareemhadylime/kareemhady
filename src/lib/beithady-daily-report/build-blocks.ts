import 'server-only';
import { supabaseAdmin } from '../supabase';
import { addDays, type ReportPeriodWindow } from './cairo-dates';
import type { AllInventories } from './units';
import { nightsInRange, type ReservationRow } from './reservations';

// Manual block + Confirmed reservation block + Available nights to EOM.
// Per Q7=YesAll:
//   - Manual block = guesty_reservations.status='reserved' (no paid guest)
//   - Confirmed block = status in (confirmed, checked_in, checked_out)
//   - Available nights to EOM = days_remaining * physical_units
//                              − manual_block_nights − confirmed_block_nights
//
// "Available nights" is forward-looking from today (the generation day,
// NOT yesterday) through end of month, since "available" only matters
// for nights still bookable.

export type BlocksSection = {
  yesterday: {
    manual_block_units: number;
    confirmed_block_units: number;
    total_blocked_units: number;
    occupancy_pct: number;
  };
  forward: {
    days_remaining: number;
    total_unit_nights: number;
    manual_block_nights: number;
    confirmed_block_nights: number;
    available_nights: number;
    available_pct: number;
  };
  manual_blocks_open: Array<{
    unit: string;
    from: string;
    to: string;
  }>;
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function buildBlocksSection(
  inventories: AllInventories,
  ctx: ReportPeriodWindow
): Promise<BlocksSection> {
  const sb = supabaseAdmin();
  const yesterday = ctx.yesterday;
  const today = ctx.generated_today;
  const eom = endOfMonthYmd(yesterday);

  // Pull both manual blocks (status='reserved') and confirmed bookings
  // that overlap the forward window (today → end of month). Reuse the
  // existing reservation query but include 'reserved' status.
  type Row = {
    id: string;
    status: string | null;
    listing_id: string | null;
    listing_nickname: string | null;
    check_in_date: string | null;
    check_out_date: string | null;
  };
  const { data, error } = await sb
    .from('guesty_reservations')
    .select(
      'id, status, listing_id, listing_nickname, check_in_date, check_out_date'
    )
    .in('status', ['reserved', 'confirmed', 'checked_in', 'checked_out'])
    .lte('check_in_date', eom)
    .gte('check_out_date', yesterday)
    .order('check_in_date', { ascending: true })
    .limit(5000);
  if (error) {
    return {
      yesterday: { manual_block_units: 0, confirmed_block_units: 0, total_blocked_units: 0, occupancy_pct: 0 },
      forward: {
        days_remaining: ctx.mtd_days_remaining,
        total_unit_nights: 0,
        manual_block_nights: 0,
        confirmed_block_nights: 0,
        available_nights: 0,
        available_pct: 0,
      },
      manual_blocks_open: [],
    };
  }

  const rows = (data as Row[] | null) || [];

  // Yesterday: count units with any block on yesterday's date.
  const manualUnitsY = new Set<string>();
  const confirmedUnitsY = new Set<string>();
  for (const r of rows) {
    if (
      !r.listing_id ||
      !r.check_in_date ||
      !r.check_out_date
    )
      continue;
    if (r.check_in_date <= yesterday && r.check_out_date > yesterday) {
      if (r.status === 'reserved') manualUnitsY.add(r.listing_id);
      else confirmedUnitsY.add(r.listing_id);
    }
  }

  // Forward (today → eom).
  let manual_block_nights = 0;
  let confirmed_block_nights = 0;
  for (const r of rows) {
    const nights = nightsInRange({ check_in_date: r.check_in_date, check_out_date: r.check_out_date }, today, eom);
    if (nights <= 0) continue;
    if (r.status === 'reserved') manual_block_nights += nights;
    else confirmed_block_nights += nights;
  }

  const days_remaining = Math.max(0, daysBetween(today, eom) + 1);
  const total_unit_nights = days_remaining * inventories.total_all;
  const available_nights = Math.max(
    0,
    total_unit_nights - manual_block_nights - confirmed_block_nights
  );

  const totalBlockedUnits = manualUnitsY.size + confirmedUnitsY.size;
  const occupancyPct =
    inventories.total_all > 0
      ? round1((totalBlockedUnits / inventories.total_all) * 100)
      : 0;

  // Open manual blocks (forward-looking) — for the popout.
  const manual_blocks_open = rows
    .filter(r => r.status === 'reserved' && r.check_out_date && r.check_out_date > today)
    .slice(0, 50)
    .map(r => ({
      unit: r.listing_nickname || r.listing_id || 'Unknown',
      from: r.check_in_date || '',
      to: r.check_out_date || '',
    }));

  return {
    yesterday: {
      manual_block_units: manualUnitsY.size,
      confirmed_block_units: confirmedUnitsY.size,
      total_blocked_units: totalBlockedUnits,
      occupancy_pct: occupancyPct,
    },
    forward: {
      days_remaining,
      total_unit_nights,
      manual_block_nights,
      confirmed_block_nights,
      available_nights,
      available_pct:
        total_unit_nights > 0
          ? round1((available_nights / total_unit_nights) * 100)
          : 0,
    },
    manual_blocks_open,
  };
}

function endOfMonthYmd(ymd: string): string {
  const [y, m] = ymd.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0));
  return last.toISOString().slice(0, 10);
}
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400_000
  );
}
