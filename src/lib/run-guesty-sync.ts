import { supabaseAdmin } from './supabase';
import {
  listGuestyListings,
  listGuestyReservations,
  type GuestyListing,
  type GuestyReservation,
} from './guesty';

// Full Guesty mirror. Pulls:
//  1) All listings (with listingType + masterListingId for the Multi-Unit
//     Strategy surfacing used by the Pricing dashboard)
//  2) Reservations in the last 365 days (any status).
//
// Safe to run daily — we upsert by id, so re-runs only add new rows and
// update changed ones.

const BACKFILL_DAYS = 365;
const LISTINGS_FIELDS =
  '_id nickname title active listingType masterListingId bedrooms accommodates propertyType accountId address tags customFields';
const RESERVATION_FIELDS =
  '_id confirmationCode status source listingId accountId guest.fullName guest.email guest.phone checkInDateLocalized checkOutDateLocalized nightsCount guestsCount money.hostPayout money.guestPaid money.fareAccommodation money.cleaningFee money.currency integration.platform integration.confirmationCode createdAt updatedAt';

function extractBuildingCode(nickname: string | null | undefined): string | null {
  if (!nickname) return null;
  const n = nickname.toUpperCase();
  const major = /\bBH-?(26|34|73|435)(?:[-\s]|$)/.exec(n);
  if (major) return `BH-${major[1]}`;
  if (/\bBH-?(OK|OKAT)/.test(n)) return 'BH-OK';
  if (/\bBH-?\d/.test(n)) return 'BH-OK';
  return null;
}

function toDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const slice = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null;
}

function toTs(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function runGuestySync(trigger: 'cron' | 'manual') {
  const sb = supabaseAdmin();

  const { data: run, error: runErr } = await sb
    .from('guesty_sync_runs')
    .insert({ trigger, status: 'running' })
    .select()
    .single();
  if (runErr || !run) {
    return { ok: false, error: 'failed_to_open_run', details: runErr };
  }
  const runId = (run as { id: string }).id;

  let listingsSynced = 0;
  let reservationsSynced = 0;

  try {
    // 1. Listings — small set (~100 for Beithady), fetch in one go then page
    // as a safety net.
    let lOffset = 0;
    while (lOffset < 1000) {
      const batch = await listGuestyListings({
        limit: 100,
        skip: lOffset,
        fields: LISTINGS_FIELDS,
      });
      const results = batch.results || [];
      if (results.length === 0) break;

      const rows = results.map((l: GuestyListing) => {
        const addr = (l.address || {}) as {
          full?: string;
          city?: string;
          country?: string;
        };
        return {
          id: String(l._id),
          account_id: typeof l.accountId === 'string' ? l.accountId : null,
          nickname: typeof l.nickname === 'string' ? l.nickname : null,
          title: typeof l.title === 'string' ? l.title : null,
          listing_type: (l.listingType as string | null) || null,
          master_listing_id:
            typeof l.masterListingId === 'string' ? l.masterListingId : null,
          bedrooms: typeof l.bedrooms === 'number' ? l.bedrooms : null,
          accommodates:
            typeof l.accommodates === 'number' ? l.accommodates : null,
          property_type:
            typeof l.propertyType === 'string' ? l.propertyType : null,
          active: typeof l.active === 'boolean' ? l.active : null,
          tags: Array.isArray(l.tags) ? l.tags : [],
          address_full: typeof addr.full === 'string' ? addr.full : null,
          address_city: typeof addr.city === 'string' ? addr.city : null,
          address_country:
            typeof addr.country === 'string' ? addr.country : null,
          building_code: extractBuildingCode(
            typeof l.nickname === 'string' ? l.nickname : null
          ),
          raw: (l as unknown) as Record<string, unknown>,
          last_synced_at: new Date().toISOString(),
        };
      });

      for (let i = 0; i < rows.length; i += 200) {
        await sb
          .from('guesty_listings')
          .upsert(rows.slice(i, i + 200), { onConflict: 'id' });
      }
      listingsSynced += results.length;
      if (results.length < 100) break;
      lOffset += 100;
    }

    // 2. Reservations — filtered by createdAt >= now - 365d.
    // Guesty's list endpoint uses MongoDB-style filters serialized as JSON.
    const cutoff = new Date(
      Date.now() - BACKFILL_DAYS * 24 * 3600 * 1000
    ).toISOString();
    let rOffset = 0;
    while (rOffset < 50000) {
      const batch = await listGuestyReservations({
        limit: 100,
        skip: rOffset,
        filters: { createdAt: { $gte: cutoff } },
        sort: 'createdAt',
        fields: RESERVATION_FIELDS,
      });
      const results = batch.results || [];
      if (results.length === 0) break;

      const rows = results.map((r: GuestyReservation) => {
        const money = (r.money || {}) as {
          hostPayout?: number;
          guestPaid?: number;
          fareAccommodation?: number;
          cleaningFee?: number;
          currency?: string;
        };
        const integration = (r.integration || {}) as {
          platform?: string;
          confirmationCode?: string;
        };
        const guest = (r.guest || {}) as {
          fullName?: string;
          email?: string;
          phone?: string;
        };
        return {
          id: String(r._id),
          confirmation_code:
            typeof r.confirmationCode === 'string' ? r.confirmationCode : null,
          platform_confirmation_code:
            typeof integration.confirmationCode === 'string'
              ? integration.confirmationCode
              : null,
          status: typeof r.status === 'string' ? r.status : null,
          source: typeof r.source === 'string' ? r.source : null,
          integration_platform:
            typeof integration.platform === 'string'
              ? integration.platform
              : null,
          listing_id: typeof r.listingId === 'string' ? r.listingId : null,
          listing_nickname: null as string | null, // filled below via join pass
          guest_name: guest.fullName || null,
          guest_email: guest.email || null,
          guest_phone: guest.phone || null,
          check_in_date: toDate(r.checkInDateLocalized),
          check_out_date: toDate(r.checkOutDateLocalized),
          nights: typeof r.nightsCount === 'number' ? r.nightsCount : null,
          guests: typeof r.guestsCount === 'number' ? r.guestsCount : null,
          currency: typeof money.currency === 'string' ? money.currency : null,
          host_payout: toNumber(money.hostPayout),
          guest_paid: toNumber(money.guestPaid),
          fare_accommodation: toNumber(money.fareAccommodation),
          cleaning_fee: toNumber(money.cleaningFee),
          created_at_odoo: toTs(r.createdAt),
          updated_at_odoo: toTs(r.updatedAt),
          raw: (r as unknown) as Record<string, unknown>,
          synced_at: new Date().toISOString(),
        };
      });

      for (let i = 0; i < rows.length; i += 200) {
        await sb
          .from('guesty_reservations')
          .upsert(rows.slice(i, i + 200), { onConflict: 'id' });
      }
      reservationsSynced += results.length;
      if (results.length < 100) break;
      rOffset += 100;
    }

    // 3. Backfill listing_nickname on reservation rows (one SQL update).
    // Cheaper than joining per-row during sync. Wrap in try — RPC may not
    // exist on fresh environments.
    try {
      await sb.rpc('guesty_backfill_reservation_nicknames');
    } catch {
      // ignore
    }

    await sb
      .from('guesty_sync_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'succeeded',
        listings_synced: listingsSynced,
        reservations_synced: reservationsSynced,
      })
      .eq('id', runId);

    return {
      ok: true,
      run_id: runId,
      listings_synced: listingsSynced,
      reservations_synced: reservationsSynced,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb
      .from('guesty_sync_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'failed',
        error: msg,
        listings_synced: listingsSynced,
        reservations_synced: reservationsSynced,
      })
      .eq('id', runId);
    return { ok: false, error: msg };
  }
}
