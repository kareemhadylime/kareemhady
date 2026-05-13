// src/lib/beithady/hc-estimator.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { bucketFromGuestyListing } from '@/lib/beithady-daily-report/units';
import { isExcludedFromReport } from '@/lib/beithady-daily-report/units';
import { resolveUnitType } from './hc-unit-type';
import type {
  BuildingKey,
  DayData,
  HKBaseData,
  UnitTypeCounts,
} from './hc-estimator-types';
import { BUILDINGS } from './hc-estimator-types';

// ─── Pure date helpers (also used by tests) ───────────────────────────────

export function getLastMonthKey(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function getLastMonthWindow(now: Date): { from: string; to: string; label: string } {
  const firstOfLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const firstOfThisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const lastDay = new Date(firstOfThisMonth.getTime() - 86400_000);

  const from = firstOfLastMonth.toISOString().slice(0, 10);
  const to = lastDay.toISOString().slice(0, 10);
  const label = firstOfLastMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return { from, to, label };
}

export function assignWeek(dayOfMonth: number): 1 | 2 | 3 | 4 {
  if (dayOfMonth <= 7) return 1;
  if (dayOfMonth <= 14) return 2;
  if (dayOfMonth <= 21) return 3;
  return 4;
}

// ─── Core aggregation ──────────────────────────────────────────────────────

type RawRes = {
  listing_id: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  building_code: string | null;
};

async function fetchRawReservations(from: string, to: string): Promise<RawRes[]> {
  const sb = supabaseAdmin();
  const collected: RawRes[] = [];
  const PAGE = 1000;

  for (let offset = 0; offset < 50000; offset += PAGE) {
    const { data, error } = await sb
      .from('guesty_reservations')
      .select(
        `listing_id, check_in_date, check_out_date,
         listing:guesty_listings!left(building_code)`
      )
      .lte('check_in_date', to)
      .gte('check_out_date', from)
      .not('status', 'in', '("cancelled","declined","canceled")')
      .order('check_in_date', { ascending: true })
      .range(offset, offset + PAGE - 1);

    if (error) throw new Error(`hc_fetch_failed: ${error.message}`);
    const batch = (data || []) as unknown as Array<{
      listing_id: string | null;
      check_in_date: string | null;
      check_out_date: string | null;
      listing: { building_code: string | null } | null;
    }>;
    for (const r of batch) {
      collected.push({
        listing_id: r.listing_id,
        check_in_date: r.check_in_date,
        check_out_date: r.check_out_date,
        building_code: r.listing?.building_code ?? null,
      });
    }
    if (batch.length < PAGE) break;
  }

  return collected;
}

export async function computeHKBaseData(now: Date = new Date()): Promise<HKBaseData> {
  const { from, to, label } = getLastMonthWindow(now);
  const rows = await fetchRawReservations(from, to);

  // Build set of all calendar dates in the month
  const dates: string[] = [];
  const cursor = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (cursor <= end) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  // Index rows by listing_id for rollover detection (BH rows only — DXB excluded)
  const byListing = new Map<string, RawRes[]>();
  for (const r of rows) {
    if (!r.listing_id || isExcludedFromReport(r.building_code)) continue;
    const b = bucketFromGuestyListing({ building_code: r.building_code, id: r.listing_id });
    if (!BUILDINGS.includes(b as BuildingKey)) continue;
    const existing = byListing.get(r.listing_id) || [];
    existing.push(r);
    byListing.set(r.listing_id, existing);
  }

  const zeroCounts = (): UnitTypeCounts => ({ studio: 0, oneBR: 0, twoBR: 0, threeBR: 0, fourBR: 0 });
  const dayDataMap = new Map<string, Map<BuildingKey, DayData>>();

  for (const date of dates) {
    const bldMap = new Map<BuildingKey, DayData>();
    for (const b of BUILDINGS) {
      bldMap.set(b, { date, building: b, checkins: zeroCounts(), stayIns: 0, sameDayRollovers: 0 });
    }
    dayDataMap.set(date, bldMap);
  }

  const totalCheckins = zeroCounts();
  let totalRollovers = 0;
  let totalStayIns = 0;

  for (const r of rows) {
    if (!r.listing_id || !r.check_in_date || !r.check_out_date) continue;

    if (isExcludedFromReport(r.building_code)) continue;
    const building = bucketFromGuestyListing({ building_code: r.building_code, id: r.listing_id });
    if (!BUILDINGS.includes(building as BuildingKey)) continue;
    const bk = building as BuildingKey;

    const unitType = resolveUnitType(r.listing_id);

    // Check-ins on this date
    if (r.check_in_date >= from && r.check_in_date <= to) {
      const bldMap = dayDataMap.get(r.check_in_date);
      if (bldMap && unitType) {
        bldMap.get(bk)!.checkins[unitType]++;
        totalCheckins[unitType]++;
      }

      // Same-day rollover: another reservation for same listing ending same day
      const siblings = byListing.get(r.listing_id) || [];
      const isRollover = siblings.some(
        s => s !== r && s.check_out_date === r.check_in_date
      );
      if (isRollover) {
        const bldMap2 = dayDataMap.get(r.check_in_date);
        if (bldMap2) {
          bldMap2.get(bk)!.sameDayRollovers++;
          totalRollovers++;
        }
      }
    }

    // Stay-ins: walk only the interior dates of this reservation
    const stayStart = new Date(Math.max(
      new Date(r.check_in_date + 'T00:00:00Z').getTime() + 86400_000,
      new Date(from + 'T00:00:00Z').getTime(),
    ));
    const stayEnd = new Date(Math.min(
      new Date(r.check_out_date + 'T00:00:00Z').getTime() - 86400_000,
      new Date(to + 'T00:00:00Z').getTime(),
    ));
    for (let d = new Date(stayStart); d <= stayEnd; d.setUTCDate(d.getUTCDate() + 1)) {
      const dateStr = d.toISOString().slice(0, 10);
      const bldMap = dayDataMap.get(dateStr);
      if (bldMap) {
        bldMap.get(bk)!.stayIns++;
        totalStayIns++;
      }
    }
  }

  // Flatten into weeks
  const weekMap = new Map<1 | 2 | 3 | 4, DayData[]>([
    [1, []], [2, []], [3, []], [4, []],
  ]);

  for (const date of dates) {
    const day = parseInt(date.slice(8, 10), 10);
    const week = assignWeek(day);
    const bldMap = dayDataMap.get(date)!;
    for (const b of BUILDINGS) {
      weekMap.get(week)!.push(bldMap.get(b)!);
    }
  }

  const weeks = ([1, 2, 3, 4] as const).map(w => ({
    week: w,
    days: weekMap.get(w)!,
  }));

  return {
    month: label,
    weeks,
    totalCheckins,
    totalRollovers,
    avgStayInsPerDay: dates.length > 0 ? Math.round(totalStayIns / dates.length) : 0,
  };
}

// ─── Snapshot-aware public entrypoint ─────────────────────────────────────

export async function fetchHKBaseData(): Promise<HKBaseData> {
  const now = new Date();
  const day = now.getUTCDate();
  const monthKey = getLastMonthKey(now);

  if (day >= 15) {
    const sb = supabaseAdmin();
    const { data } = await sb
      .from('hc_estimator_snapshots')
      .select('data')
      .eq('month_key', monthKey)
      .maybeSingle();
    // If snapshot query errors, data is null — fall through to live aggregation gracefully.
    if (data) return data.data as HKBaseData;
  }

  return computeHKBaseData(now);
}

export async function saveSnapshot(now: Date = new Date()): Promise<void> {
  const monthKey = getLastMonthKey(now);
  const baseData = await computeHKBaseData(now);
  const sb = supabaseAdmin();
  await sb
    .from('hc_estimator_snapshots')
    .upsert({ month_key: monthKey, data: baseData }, { onConflict: 'month_key' });
}
