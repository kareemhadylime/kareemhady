import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { ForwardOccupancyRow, BuildingCode } from './types';
import { BUILDING_CODES } from './types';

// ── View / column reference ───────────────────────────────────────────────────
// Table: beithady_reservation_grid_v
// Relevant columns used below:
//   check_in_date  DATE   — 'YYYY-MM-DD'
//   check_out_date DATE   — 'YYYY-MM-DD'  (exclusive checkout convention)
//   building_code  TEXT   — e.g. 'BH-26'
//   status         TEXT   — 'confirmed' | 'checked_in' | 'checked_out' | 'canceled' | …
// (Verified against build-cancel-risk.ts, build-buildings.ts, reservations.ts)

const WINDOWS: Array<7 | 30 | 60> = [7, 30, 60];

/**
 * Computes 7/30/60-day forward occupancy per building by counting confirmed
 * unit-nights from beithady_reservation_grid_v and dividing by
 * (unit_count × window_days).
 *
 * Returns null on DB error; returns rows with 0s for buildings with no units.
 */
export async function buildForwardOccupancy(
  today: string,
  unitCounts: Record<BuildingCode, number>
): Promise<ForwardOccupancyRow[] | null> {
  try {
    const supabase = supabaseAdmin();
    const todayDate = new Date(today + 'T00:00:00Z');
    const horizonEnd = new Date(todayDate.getTime() + 60 * 86400_000)
      .toISOString()
      .slice(0, 10);

    // Pull confirmed/checked_in reservations whose stay overlaps the next 60 days.
    // Filter: check_in_date <= horizonEnd AND check_out_date > today
    const { data, error } = await supabase
      .from('beithady_reservation_grid_v')
      .select('check_in_date, check_out_date, building_code, status')
      .lte('check_in_date', horizonEnd)
      .gt('check_out_date', today)
      .in('status', ['confirmed', 'checked_in']);

    if (error) {
      console.warn('[build-forward-occupancy]', error.message);
      return null;
    }

    type GridRow = {
      check_in_date: string | null;
      check_out_date: string | null;
      building_code: string | null;
      status: string | null;
    };

    const rows: ForwardOccupancyRow[] = BUILDING_CODES.map((building) => {
      const unitsForBuilding = unitCounts[building] ?? 0;
      const result: ForwardOccupancyRow = { building, d7_pct: 0, d30_pct: 0, d60_pct: 0 };
      if (unitsForBuilding === 0) return result;

      for (const win of WINDOWS) {
        const winEnd = new Date(todayDate.getTime() + win * 86400_000);
        let nightsBooked = 0;

        for (const r of (data as GridRow[] | null) ?? []) {
          if (r.building_code !== building) continue;
          if (!r.check_in_date || !r.check_out_date) continue;

          const ci = new Date(r.check_in_date + 'T00:00:00Z');
          const co = new Date(r.check_out_date + 'T00:00:00Z');

          // Clip stay to the window [today, today+win)
          const overlapStart = ci > todayDate ? ci : todayDate;
          const overlapEnd = co < winEnd ? co : winEnd;
          const nights = Math.max(
            0,
            Math.floor((overlapEnd.getTime() - overlapStart.getTime()) / 86400_000)
          );
          nightsBooked += nights;
        }

        const denom = unitsForBuilding * win;
        const pct = denom > 0 ? (nightsBooked / denom) * 100 : 0;
        if (win === 7) result.d7_pct = pct;
        else if (win === 30) result.d30_pct = pct;
        else result.d60_pct = pct;
      }

      return result;
    });

    return rows;
  } catch (err) {
    console.warn('[build-forward-occupancy] exception', err);
    return null;
  }
}
