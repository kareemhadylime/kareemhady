import 'server-only';
import { guestyFetch } from '@/lib/guesty';

// Phase J.7 — Guesty write wrappers for the Operations Calendar.
// Best-effort: on failure we return {ok:false, error} so callers can
// keep the local block while flagging the sync error.

// Block availability for a listing across [startDate, endDate] (exclusive).
// Uses Guesty's PUT /v1/calendar/listings/{listingId} endpoint with
// per-day status:'unavailable'. If the Guesty API surface differs in
// production, the error is captured and the local block remains.
export async function blockGuestyAvailability(opts: {
  listingId: string;
  startDate: string;       // YYYY-MM-DD
  endDate: string;         // YYYY-MM-DD (exclusive)
  reason: string;          // 'owner_stay'|'maintenance'|'hold'|'other'
  note?: string;
}): Promise<{ ok: boolean; error?: string; status?: number }> {
  try {
    // Build per-day patches (Guesty's calendar API accepts an array of
    // {date, status, blockReason, note} entries).
    const days: Array<{ date: string; status: 'unavailable'; note?: string }> = [];
    const start = new Date(opts.startDate + 'T00:00:00');
    const end = new Date(opts.endDate + 'T00:00:00');
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      days.push({
        date: d.toISOString().slice(0, 10),
        status: 'unavailable',
        note: opts.note ? `[${opts.reason}] ${opts.note}` : `[${opts.reason}] Beithady manual block`,
      });
    }
    await guestyFetch(`/calendar/listings/${opts.listingId}`, {
      method: 'PUT',
      body: { days },
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const m = msg.match(/^guesty_(\d+)/);
    return { ok: false, status: m ? parseInt(m[1], 10) : 500, error: msg };
  }
}

// Reverse: re-open availability for a listing across a date range.
export async function unblockGuestyAvailability(opts: {
  listingId: string;
  startDate: string;
  endDate: string;
}): Promise<{ ok: boolean; error?: string; status?: number }> {
  try {
    const days: Array<{ date: string; status: 'available' }> = [];
    const start = new Date(opts.startDate + 'T00:00:00');
    const end = new Date(opts.endDate + 'T00:00:00');
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      days.push({ date: d.toISOString().slice(0, 10), status: 'available' });
    }
    await guestyFetch(`/calendar/listings/${opts.listingId}`, {
      method: 'PUT',
      body: { days },
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const m = msg.match(/^guesty_(\d+)/);
    return { ok: false, status: m ? parseInt(m[1], 10) : 500, error: msg };
  }
}
