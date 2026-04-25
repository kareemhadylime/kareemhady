'use client';

import { openAppDb, dbPut, dbGetAll, dbClear, STORE_BOOKINGS } from './idb';

// Cached shape — minimal display data for booking lists / detail views.
// Receipts and signed-URL images intentionally NOT cached: they expire
// and the photos add significant storage weight.

export type CachedBooking = {
  id: string;
  booking_date: string;
  status: string;
  price_egp: number;
  notes: string | null;
  boat_name: string;
  owner_name: string;
  broker_name: string;
  client_name?: string;
  client_phone?: string;
  guest_count?: number;
  trip_ready_time?: string;
  destination_name?: string;
  cached_at: number;        // ms epoch
  role: 'broker' | 'owner'; // namespace by role so a multi-role user doesn't bleed
};

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export async function cacheBookings(rows: CachedBooking[]): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await openAppDb();
    await dbPut(db, STORE_BOOKINGS, rows);
  } catch {
    // Quota / private mode — give up silently.
  }
}

export async function readCachedBookings(role: 'broker' | 'owner'): Promise<CachedBooking[]> {
  if (typeof window === 'undefined') return [];
  try {
    const db = await openAppDb();
    const rows = await dbGetAll<CachedBooking>(db, STORE_BOOKINGS);
    const cutoff = Date.now() - TTL_MS;
    return rows.filter(r => r.role === role && r.cached_at >= cutoff);
  } catch {
    return [];
  }
}

export async function clearCachedBookings(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const db = await openAppDb();
    await dbClear(db, STORE_BOOKINGS);
  } catch {
    /* ignore */
  }
}
