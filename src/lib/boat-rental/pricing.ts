import 'server-only';
import { supabaseAdmin } from '../supabase';

// Pricing + date utilities for boat-rental. All dates are
// Africa/Cairo-anchored — bookings are day-level entities and the
// 72-hour cancellation cutoff is measured against Cairo midnight.

export type PricingTier = 'weekday' | 'weekend' | 'season';

// Returns Cairo-local Y/M/D components for a given wall-clock instant.
// Uses Intl without Date math so DST (Egypt no longer observes, but
// belt-and-braces) is handled correctly.
function cairoParts(d: Date): { y: number; m: number; d: number; dow: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  });
  const parts = fmt.formatToParts(d);
  const y = parseInt(parts.find(p => p.type === 'year')!.value, 10);
  const m = parseInt(parts.find(p => p.type === 'month')!.value, 10);
  const day = parseInt(parts.find(p => p.type === 'day')!.value, 10);
  const wk = parts.find(p => p.type === 'weekday')!.value; // 'Mon' etc.
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { y, m, d: day, dow: dowMap[wk] ?? 0 };
}

// Day-of-week for a YYYY-MM-DD string, interpreted as Cairo date.
// Uses UTC to avoid host-tz surprises — the date string is already TZ-
// independent (it's a calendar date, not an instant).
export function dayOfWeekForDate(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  // 2000-01-01 is Saturday; Date.UTC handles pre-epoch safely for reasonable years.
  const jsDate = new Date(Date.UTC(y, m - 1, d));
  return jsDate.getUTCDay(); // 0=Sun .. 6=Sat
}

// Fri = 5, Sat = 6 in Egypt (the weekend).
export function isWeekendDate(dateStr: string): boolean {
  const dow = dayOfWeekForDate(dateStr);
  return dow === 5 || dow === 6;
}

// Resolves which pricing tier applies to a given booking_date.
// Priority: season (any matching range) > weekend > weekday.
export async function resolvePricingTier(dateStr: string): Promise<PricingTier> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('boat_rental_seasons')
    .select('id')
    .lte('start_date', dateStr)
    .gte('end_date', dateStr)
    .limit(1)
    .maybeSingle();
  if (data) return 'season';
  return isWeekendDate(dateStr) ? 'weekend' : 'weekday';
}

// Looks up the amount for a boat + tier. Returns null if not priced.
export async function getPriceForBoatTier(boatId: string, tier: PricingTier): Promise<number | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('boat_rental_pricing')
    .select('amount_egp')
    .eq('boat_id', boatId)
    .eq('tier', tier)
    .maybeSingle();
  if (!data) return null;
  return Number((data as { amount_egp: number | string }).amount_egp);
}

// Convenience: resolve tier + price in one shot.
export async function priceForBoatOnDate(
  boatId: string,
  dateStr: string
): Promise<{ tier: PricingTier; amountEgp: number } | null> {
  const tier = await resolvePricingTier(dateStr);
  const amount = await getPriceForBoatTier(boatId, tier);
  if (amount === null) return null;
  return { tier, amountEgp: amount };
}

// ---- Cancellation window ----
//
// Cancellable when: now (Cairo) < midnight-of(booking_date, Cairo) - 72h.
// i.e. there's more than 72h until the booking DAY begins in Cairo.
export function isWithinCancellationWindow(bookingDate: string, now: Date = new Date()): boolean {
  // Compute 'now' in terms of Cairo offset using Intl to get a reference ms.
  // Trick: format a known UTC instant as Cairo and infer offset. Cleaner:
  // build a Date representing Cairo-midnight of booking_date, then compare.
  //
  // Cairo is UTC+02:00 year-round (Egypt dropped DST in 2014, reintroduced
  // briefly, currently not observing as of 2024+). We use a safe Intl path
  // rather than hardcoding +02:00 in case the government reverses again.
  const cairoMidnightUtcMs = cairoLocalMidnightToUtcMs(bookingDate);
  const cutoff = cairoMidnightUtcMs - 72 * 3600 * 1000;
  return now.getTime() < cutoff;
}

function cairoLocalMidnightToUtcMs(dateStr: string): number {
  // Build a Date for 00:00 local Cairo on dateStr. Strategy: take a naive
  // UTC timestamp for YYYY-MM-DDT00:00:00Z, then adjust by the Cairo
  // offset for that day.
  const [y, m, d] = dateStr.split('-').map(Number);
  const naiveUtc = Date.UTC(y, m - 1, d, 0, 0, 0, 0);
  // Format this instant as Cairo; the delta from our naive UTC 00:00
  // gives us the offset minutes we need to subtract.
  const offsetMinutes = getCairoOffsetMinutes(new Date(naiveUtc));
  return naiveUtc - offsetMinutes * 60 * 1000;
}

function getCairoOffsetMinutes(d: Date): number {
  // Use the "timeZoneName: 'shortOffset'" hack which returns e.g. 'GMT+2'.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    timeZoneName: 'shortOffset',
  });
  const parts = fmt.formatToParts(d);
  const name = parts.find(p => p.type === 'timeZoneName')?.value || 'GMT+2';
  const match = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(name);
  if (!match) return 120;
  const sign = match[1] === '-' ? -1 : 1;
  const hours = parseInt(match[2], 10);
  const mins = match[3] ? parseInt(match[3], 10) : 0;
  return sign * (hours * 60 + mins);
}

// Quick Cairo "today" string in YYYY-MM-DD for queries.
export function cairoTodayStr(now: Date = new Date()): string {
  const p = cairoParts(now);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}
