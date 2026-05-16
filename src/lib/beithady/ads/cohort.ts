import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export type CohortLeadInput = {
  created_at: string;
  matched_at: string | null;
};

export type CohortRow = {
  week_label: string;
  week_start: string;
  leads: number;
  bookings_by_lag: [number, number, number, number, number];
  conversion_pcts_by_lag: [number, number, number, number, number];
};

export type CohortMatrix = { cohorts: CohortRow[] };

const MS_PER_DAY = 86_400_000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

// Convert any timestamp to a Cairo-local Monday (returns 'YYYY-MM-DD').
// Uses Africa/Cairo offset via the toLocaleString trick (DST-safe).
export function cairoIsoWeekStart(iso: string): string {
  const d = new Date(iso);
  // Get Cairo local Y/M/D using en-CA which formats as YYYY-MM-DD.
  const cairoYmd = d.toLocaleString('en-CA', { timeZone: 'Africa/Cairo' }).slice(0, 10);
  const cairoDateMidnight = new Date(cairoYmd + 'T00:00:00Z').getTime();
  // Day-of-week in Cairo (0=Sun, 1=Mon, ..., 6=Sat).
  const weekdayShort = d.toLocaleString('en-US', { timeZone: 'Africa/Cairo', weekday: 'short' });
  const cairoDow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(weekdayShort);
  // Monday = 1; days back from current Cairo day to Monday:
  const daysBack = (cairoDow + 6) % 7;
  const mondayMs = cairoDateMidnight - daysBack * MS_PER_DAY;
  return new Date(mondayMs).toISOString().slice(0, 10);
}

export function lagWeeksBetween(cohortStartIso: string, eventIso: string): number {
  const start = new Date(cohortStartIso + 'T00:00:00Z').getTime();
  const ev = new Date(eventIso).getTime();
  return Math.max(0, Math.floor((ev - start) / MS_PER_WEEK));
}

export function cellColorBucket(pct: number): string {
  if (pct <= 0) return 'bg-slate-100 dark:bg-slate-800';
  if (pct <= 5) return 'bg-emerald-50 dark:bg-emerald-950';
  if (pct <= 10) return 'bg-emerald-200/40 dark:bg-emerald-700/40';
  if (pct <= 20) return 'bg-emerald-400/40 dark:bg-emerald-500/40';
  return 'bg-emerald-500/40 dark:bg-emerald-400/40';
}

export function computeCohortMatrix(
  leads: CohortLeadInput[],
  opts: { todayIso: string; weeksBack?: number },
): CohortMatrix {
  const weeksBack = opts.weeksBack ?? 6;
  const todayWeekStart = cairoIsoWeekStart(opts.todayIso + 'T12:00:00+03:00');
  const todayMs = new Date(todayWeekStart + 'T00:00:00Z').getTime();

  // Build the cohort week starts: most recent N COMPLETE weeks (excluding current).
  const cohortStarts: string[] = [];
  for (let n = 1; n <= weeksBack; n++) {
    cohortStarts.push(new Date(todayMs - n * MS_PER_WEEK).toISOString().slice(0, 10));
  }

  const byCohort = new Map<string, { leads: number; bookingsByLag: [number, number, number, number, number] }>();
  for (const start of cohortStarts) byCohort.set(start, { leads: 0, bookingsByLag: [0,0,0,0,0] });

  for (const lead of leads) {
    const cohortStart = cairoIsoWeekStart(lead.created_at);
    if (!byCohort.has(cohortStart)) continue;  // outside our window OR current week
    const slot = byCohort.get(cohortStart)!;
    slot.leads += 1;
    if (lead.matched_at) {
      const lag = lagWeeksBetween(cohortStart, lead.matched_at);
      const idx = Math.min(4, Math.max(0, lag - 1));   // lag 1→idx 0; lag 5+ → idx 4
      slot.bookingsByLag[idx] += 1;
    }
  }

  const cohorts: CohortRow[] = cohortStarts.map(start => {
    const slot = byCohort.get(start)!;
    const wkNum = Math.ceil(
      ((new Date(start + 'T00:00:00Z').getTime() - new Date(`${start.slice(0, 4)}-01-01T00:00:00Z`).getTime()) / MS_PER_DAY + 1) / 7
    );
    const startDate = new Date(start + 'T00:00:00Z');
    const month = startDate.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
    const day = startDate.getUTCDate();
    return {
      week_label: `W${wkNum} (${month} ${day})`,
      week_start: start,
      leads: slot.leads,
      bookings_by_lag: slot.bookingsByLag,
      conversion_pcts_by_lag: slot.bookingsByLag.map(b =>
        slot.leads > 0 ? Math.round((b / slot.leads) * 1000) / 10 : 0
      ) as [number, number, number, number, number],
    };
  });

  return { cohorts };
}

export async function getCohortMatrix(opts: {
  weeksBack?: number;
  buildingCode?: string;
}): Promise<CohortMatrix> {
  const sb = supabaseAdmin();
  const weeksBack = opts.weeksBack ?? 6;
  // Pull leads from the oldest cohort start + a buffer so all lag computations have data.
  const buffer = 5;
  const oldestStart = new Date(Date.now() - (weeksBack + buffer + 1) * MS_PER_WEEK).toISOString().slice(0, 10);

  const { data, error } = await sb.from('ads_leads')
    .select('id, created_at, matched_at, matched_reservation_id, building_interest')
    .gte('created_at', oldestStart);
  if (error) { console.error('[cohort] query failed:', error); return { cohorts: [] }; }
  const rows = (data as Array<{
    id: number;
    created_at: string;
    matched_at: string | null;
    matched_reservation_id: string | null;
    building_interest: string | null;
  }> | null) ?? [];

  // Per-building filter — if active, join through guesty for booked builders.
  let filtered = rows;
  if (opts.buildingCode) {
    const { attributeLeadToBuilding } = await import('./per-building');
    const { buildingMapForLeads } = await import('./funnel');
    const buildingByReservation = await buildingMapForLeads(sb, rows);
    filtered = rows.filter(r => {
      const bookedBuilding = r.matched_reservation_id ? buildingByReservation.get(r.matched_reservation_id) ?? null : null;
      return attributeLeadToBuilding({ matched_reservation_building: bookedBuilding, building_interest: r.building_interest }) === opts.buildingCode;
    });
  }

  return computeCohortMatrix(
    filtered.map(r => ({ created_at: r.created_at, matched_at: r.matched_at })),
    { todayIso: new Date().toISOString().slice(0, 10), weeksBack },
  );
}
