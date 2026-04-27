import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

// 90-day occupancy heatmap per Beithady building. Computes occupancy
// from guesty_reservations × guesty_listings.

export type HeatmapCell = {
  date: string;            // YYYY-MM-DD
  building_code: string;
  booked: number;
  total_units: number;
  occupancy_pct: number;
};

export type HeatmapRow = {
  building_code: string;
  total_units: number;
  cells: HeatmapCell[];
};

export type HeatmapResult = {
  start_date: string;
  end_date: string;
  rows: HeatmapRow[];
  total_cells: number;
};

const BUILDINGS = ['BH-26', 'BH-73', 'BH-435', 'BH-OK', 'BH-34'] as const;

export async function buildHeatmap(daysAhead = 90): Promise<HeatmapResult> {
  const sb = supabaseAdmin();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = today.toISOString().slice(0, 10);
  const end = new Date(today.getTime() + daysAhead * 86400e3).toISOString().slice(0, 10);

  // Pull active listings per building (count of distinct units we have).
  const { data: listings } = await sb
    .from('guesty_listings')
    .select('id, building_code, listing_type, master_listing_id')
    .eq('active', true)
    .neq('listing_type', 'MTL'); // exclude multi-unit parents (children are the bookable units)
  const totalByBuilding = new Map<string, number>();
  for (const l of (listings as Array<{ building_code: string | null }> | null) || []) {
    if (!l.building_code) continue;
    if (!BUILDINGS.includes(l.building_code as typeof BUILDINGS[number])) continue;
    totalByBuilding.set(l.building_code, (totalByBuilding.get(l.building_code) || 0) + 1);
  }

  // Pull reservations overlapping the window
  const { data: reservations } = await sb
    .from('guesty_reservations')
    .select('listing_id, check_in_date, check_out_date, status')
    .gte('check_out_date', start)
    .lte('check_in_date', end);

  const listingToBuilding = new Map<string, string>();
  for (const l of (listings as Array<{ id: string; building_code: string | null }> | null) || []) {
    if (l.building_code) listingToBuilding.set(l.id, l.building_code);
  }

  // Aggregate booked count per (building, date)
  const bookedKey = (b: string, d: string) => `${b}|${d}`;
  const bookedMap = new Map<string, number>();

  for (const r of (reservations as Array<{
    listing_id: string | null;
    check_in_date: string | null;
    check_out_date: string | null;
    status: string | null;
  }> | null) || []) {
    if (!r.listing_id || !r.check_in_date || !r.check_out_date) continue;
    if (r.status && /cancel|inquiry|declined/i.test(r.status)) continue;
    const building = listingToBuilding.get(r.listing_id);
    if (!building) continue;
    const ci = new Date(r.check_in_date);
    const co = new Date(r.check_out_date);
    for (let d = new Date(Math.max(ci.getTime(), today.getTime())); d < co; d = new Date(d.getTime() + 86400e3)) {
      const ds = d.toISOString().slice(0, 10);
      if (ds > end) break;
      const key = bookedKey(building, ds);
      bookedMap.set(key, (bookedMap.get(key) || 0) + 1);
    }
  }

  // Build the grid
  const days: string[] = [];
  for (let i = 0; i <= daysAhead; i++) {
    days.push(new Date(today.getTime() + i * 86400e3).toISOString().slice(0, 10));
  }

  const rows: HeatmapRow[] = BUILDINGS.map(building => {
    const totalUnits = totalByBuilding.get(building) || 0;
    const cells: HeatmapCell[] = days.map(date => {
      const booked = bookedMap.get(bookedKey(building, date)) || 0;
      const occ = totalUnits > 0 ? Math.round((booked / totalUnits) * 100) : 0;
      return { date, building_code: building, booked, total_units: totalUnits, occupancy_pct: occ };
    });
    return { building_code: building, total_units: totalUnits, cells };
  }).filter(r => r.total_units > 0); // hide empty buildings

  return {
    start_date: start,
    end_date: end,
    rows,
    total_cells: rows.reduce((s, r) => s + r.cells.length, 0),
  };
}
