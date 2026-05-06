import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { OccupancyGapNight, BuildingCode } from './types';
import { BUILDING_CODES } from './types';

// ── View / column reference ───────────────────────────────────────────────────
// Table: beithady_reservation_grid_v
// Relevant columns used below:
//   check_in_date  DATE   — 'YYYY-MM-DD'
//   check_out_date DATE   — 'YYYY-MM-DD'  (exclusive checkout convention)
//   building_code  TEXT   — e.g. 'BH-26'
//   status         TEXT   — 'confirmed' | 'checked_in' | 'checked_out' | 'canceled' | …
// (Verified against build-cancel-risk.ts, build-buildings.ts, reservations.ts)

const HORIZON_DAYS = 14;
const LOW_OCC_THRESHOLD_PCT = 50;
const MAX_GAPS = 30;

/**
 * Lists upcoming low-occupancy nights for the next 14 days.
 * For each day where building occupancy < 50%, emits a gap row.
 *
 * V1 simplification: current_price_usd + market_median_usd are null
 * (V1.5 should pull from PriceLabs).
 *
 * Returns null only on unexpected error.
 */
export async function buildOccupancyGaps(
  today: string,
  unitCounts: Record<BuildingCode, number>
): Promise<OccupancyGapNight[] | null> {
  try {
    const todayDate = new Date(today + 'T00:00:00Z');
    const horizonEnd = new Date(todayDate.getTime() + HORIZON_DAYS * 86400_000)
      .toISOString()
      .slice(0, 10);

    // Fetch reservations whose stay overlaps the next 14 days
    const { data, error } = await supabaseAdmin()
      .from('beithady_reservation_grid_v')
      .select('check_in_date, check_out_date, building_code, status')
      .lte('check_in_date', horizonEnd)
      .gt('check_out_date', today)
      .in('status', ['confirmed', 'checked_in']);

    if (error || !data) return null;

    type GridRow = {
      check_in_date: string | null;
      check_out_date: string | null;
      building_code: string | null;
      status: string | null;
    };

    const gaps: OccupancyGapNight[] = [];

    for (let dayOffset = 0; dayOffset < HORIZON_DAYS; dayOffset++) {
      const dayStart = new Date(todayDate.getTime() + dayOffset * 86400_000);
      const dayEnd = new Date(todayDate.getTime() + (dayOffset + 1) * 86400_000);
      const dateStr = dayStart.toISOString().slice(0, 10);

      for (const building of BUILDING_CODES) {
        const units = unitCounts[building] ?? 0;
        if (units === 0) continue;

        let occupied = 0;
        for (const r of data as GridRow[]) {
          if (r.building_code !== building) continue;
          if (!r.check_in_date || !r.check_out_date) continue;

          const ci = new Date(r.check_in_date + 'T00:00:00Z');
          const co = new Date(r.check_out_date + 'T00:00:00Z');

          // Reservation occupies the night starting at dayStart if:
          // check_in_date < dayEnd AND check_out_date > dayStart
          if (ci < dayEnd && co > dayStart) {
            occupied += 1;
          }
        }

        const pct = (occupied / units) * 100;
        if (pct < LOW_OCC_THRESHOLD_PCT) {
          gaps.push({
            date: dateStr,
            building,
            unit: null,
            occupancy_pct: pct,
            current_price_usd: null,   // V1: not available; V1.5 should pull from PriceLabs
            market_median_usd: null,   // V1: not available; V1.5 should pull from PriceLabs
          });
        }
      }
    }

    // Sort: lowest occupancy first (most urgent gaps at top)
    return gaps.sort((a, b) => a.occupancy_pct - b.occupancy_pct).slice(0, MAX_GAPS);
  } catch (err) {
    console.warn('[build-occupancy-gaps] exception', err);
    return null;
  }
}
