import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { tierForStays } from './loyalty';

// CRM sync — runs daily at 30 5 * * * UTC (07:30 / 08:30 Cairo)
// and on-demand via /api/cron/beithady-crm-sync?force=1.
//
// Strategy:
//   1) Open run row in beithady_crm_sync_runs.
//   2) Pull every guesty_conversations row with a guest_id; upsert
//      into beithady_guests keyed by guesty_guest_id.
//   3) Pull every guesty_reservations row; group by (lower(email),
//      digits(phone)). Match each group to an existing guest by email
//      or phone; otherwise create a guest with guesty_guest_id NULL.
//   4) Compute lifetime stats from completed/active reservations.
//   5) Derive residence_country from raw.guest.address.country when
//      available.
//   6) Refresh timeline cache for guests with new activity.
//   7) Mark run finished.
//
// Lifetime stats currency conversion uses the AED→USD peg (3.6725)
// for AED, the daily fx_rates table for EGP, and passthrough for USD.
// SAR is rare in the corpus; treated like AED via the SAR→USD peg of
// 3.75 (1 USD = 3.75 SAR, also pegged).

const AED_PER_USD = 3.6725;
const SAR_PER_USD = 3.75;

type GuestyConvRow = {
  guest_id: string | null;
  guest_full_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  guest_is_returning: boolean | null;
  raw: Record<string, unknown> | null;
  modified_at_guesty: string | null;
  last_message_user_at: string | null;
  last_message_nonuser_at: string | null;
};

type GuestyResRow = {
  id: string;
  status: string | null;
  source: string | null;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  nights: number | null;
  currency: string | null;
  host_payout: number | null;
  guest_paid: number | null;
  raw: Record<string, unknown> | null;
};

type GuestKey = string;
type GuestAccumulator = {
  // Identity
  guesty_guest_id: string | null;
  full_name: string | null;
  email: string | null;
  phone_e164: string | null;
  // Stats
  lifetime_stays: number;
  lifetime_nights: number;
  lifetime_spend_usd: number;
  first_seen: string | null;     // ISO
  last_seen: string | null;      // ISO
  next_arrival_at: string | null;
  // Derivations
  residence_country: string | null;
  language: string | null;
  preferred_channel: string | null;
  // Signals
  source_signals: {
    has_conversation: boolean;
    reservation_count: number;
    sources: string[];
    is_returning_per_guesty: boolean;
  };
  // For matching
  match_emails: Set<string>;
  match_phones: Set<string>;
};

// ---- helpers ----

function digitsOnly(s: string | null | undefined): string {
  return (s || '').replace(/[^0-9]/g, '');
}
function lowerEmail(s: string | null | undefined): string {
  return (s || '').trim().toLowerCase();
}
function pickStrongest<T>(a: T | null, b: T | null): T | null {
  if (a && !b) return a;
  if (!a && b) return b;
  // Prefer the longer one when both exist (better signal heuristic).
  if (typeof a === 'string' && typeof b === 'string') {
    return (a.length >= b.length ? a : b) as T;
  }
  return a ?? b;
}
function maxIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}
function minIso(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}
function asStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string');
  return [];
}
function getNested(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur && typeof cur === 'object' && k in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[k];
    } else {
      return undefined;
    }
  }
  return cur;
}

async function getEgpToUsdRate(): Promise<number> {
  // Reuse the fx_rates table populated by the daily-report fx helper.
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('fx_rates')
    .select('rate_per_usd')
    .eq('currency', 'EGP')
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle();
  const rate = (data as { rate_per_usd?: number } | null)?.rate_per_usd;
  return rate && rate > 0 ? rate : 49; // sensible 2026 fallback
}

function payoutToUsd(amount: number | null, currency: string | null, egpRate: number): number {
  const a = Number(amount) || 0;
  const c = (currency || 'USD').toUpperCase();
  if (c === 'USD') return a;
  if (c === 'AED') return a / AED_PER_USD;
  if (c === 'SAR') return a / SAR_PER_USD;
  if (c === 'EGP') return a / egpRate;
  return a; // unknown currency — passthrough rather than zero
}

function isCompletedOrUpcoming(status: string | null): boolean {
  if (!status) return true; // generous: include if status absent
  const s = status.toLowerCase();
  return s !== 'inquiry' && s !== 'canceled' && s !== 'cancelled' && s !== 'declined';
}

function deriveCountryFromRaw(raw: Record<string, unknown> | null): string | null {
  if (!raw) return null;
  // Guesty's reservation.raw.guest.address.country is the typical source;
  // conversations.raw.meta.guest.address.country is similar.
  const candidates: unknown[] = [
    getNested(raw, ['guest', 'address', 'country']),
    getNested(raw, ['guest', 'address', 'countryCode']),
    getNested(raw, ['meta', 'guest', 'address', 'country']),
    getNested(raw, ['meta', 'guest', 'address', 'countryCode']),
    getNested(raw, ['guest', 'country']),
    getNested(raw, ['address', 'country']),
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim().length > 0) {
      const trimmed = c.trim();
      // ISO-3166 alpha-2 if 2 letters; otherwise leave the full name and
      // a future job can normalize.
      return trimmed.length === 2 ? trimmed.toUpperCase() : trimmed;
    }
  }
  return null;
}

function deriveLanguageFromRaw(raw: Record<string, unknown> | null): string | null {
  if (!raw) return null;
  const candidates: unknown[] = [
    getNested(raw, ['internal', 'language']),
    getNested(raw, ['guest', 'language']),
    getNested(raw, ['meta', 'guest', 'language']),
  ];
  for (const v of candidates) {
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return null;
}

// Build the in-memory accumulator. Returns a map keyed by either the
// guesty_guest_id (when present) or a synthetic key derived from email
// or phone.
async function buildAccumulators(
  conversations: GuestyConvRow[],
  reservations: GuestyResRow[],
  egpRate: number
): Promise<Map<GuestKey, GuestAccumulator>> {
  const byKey = new Map<GuestKey, GuestAccumulator>();
  // Index for fast email/phone lookups across keys
  const keyByEmail = new Map<string, GuestKey>();
  const keyByPhone = new Map<string, GuestKey>();

  function ensure(
    key: GuestKey,
    seed: Partial<GuestAccumulator> & { guesty_guest_id: string | null }
  ): GuestAccumulator {
    let g = byKey.get(key);
    if (g) return g;
    g = {
      guesty_guest_id: seed.guesty_guest_id ?? null,
      full_name: seed.full_name ?? null,
      email: seed.email ?? null,
      phone_e164: seed.phone_e164 ?? null,
      lifetime_stays: 0,
      lifetime_nights: 0,
      lifetime_spend_usd: 0,
      first_seen: null,
      last_seen: null,
      next_arrival_at: null,
      residence_country: null,
      language: null,
      preferred_channel: null,
      source_signals: {
        has_conversation: false,
        reservation_count: 0,
        sources: [],
        is_returning_per_guesty: false,
      },
      match_emails: new Set<string>(),
      match_phones: new Set<string>(),
    };
    byKey.set(key, g);
    return g;
  }

  // ---- Pass 1: conversations ----
  for (const c of conversations) {
    if (!c.guest_id) continue;
    const key = `gid:${c.guest_id}`;
    const g = ensure(key, { guesty_guest_id: c.guest_id });
    g.full_name = pickStrongest(g.full_name, c.guest_full_name);
    g.email = pickStrongest(g.email, c.guest_email);
    g.phone_e164 = pickStrongest(g.phone_e164, c.guest_phone ? '+' + digitsOnly(c.guest_phone) : null);
    if (c.guest_email) {
      const e = lowerEmail(c.guest_email);
      g.match_emails.add(e);
      keyByEmail.set(e, key);
    }
    if (c.guest_phone) {
      const p = digitsOnly(c.guest_phone);
      if (p.length >= 8) {
        g.match_phones.add(p);
        keyByPhone.set(p, key);
      }
    }
    g.source_signals.has_conversation = true;
    g.source_signals.is_returning_per_guesty =
      g.source_signals.is_returning_per_guesty || c.guest_is_returning === true;
    g.last_seen = maxIso(g.last_seen, c.modified_at_guesty);
    g.last_seen = maxIso(g.last_seen, c.last_message_nonuser_at);
    const country = deriveCountryFromRaw(c.raw);
    if (country && !g.residence_country) g.residence_country = country;
    const lang = deriveLanguageFromRaw(c.raw);
    if (lang && !g.language) g.language = lang;
  }

  // ---- Pass 2: reservations ----
  // Match each reservation to an existing guest by guesty_guest_id (rare,
  // not stored on reservations), email, or phone. Otherwise create a
  // synthetic guest keyed by email|phone.
  const todayIso = new Date().toISOString().slice(0, 10);
  for (const r of reservations) {
    const email = lowerEmail(r.guest_email);
    const phone = digitsOnly(r.guest_phone);
    let key: GuestKey | null = null;
    if (email && keyByEmail.has(email)) key = keyByEmail.get(email)!;
    else if (phone && phone.length >= 8 && keyByPhone.has(phone)) key = keyByPhone.get(phone)!;
    else if (email) {
      key = `email:${email}`;
      keyByEmail.set(email, key);
    } else if (phone && phone.length >= 8) {
      key = `phone:${phone}`;
      keyByPhone.set(phone, key);
    } else {
      // Anonymous reservation — skip (very rare in Guesty data).
      continue;
    }

    const g = ensure(key, { guesty_guest_id: null });
    g.full_name = pickStrongest(g.full_name, r.guest_name);
    g.email = pickStrongest(g.email, r.guest_email);
    g.phone_e164 = pickStrongest(g.phone_e164, r.guest_phone ? '+' + digitsOnly(r.guest_phone) : null);
    if (email) g.match_emails.add(email);
    if (phone && phone.length >= 8) g.match_phones.add(phone);

    g.source_signals.reservation_count += 1;
    if (r.source && !g.source_signals.sources.includes(r.source)) {
      g.source_signals.sources.push(r.source);
    }
    if (isCompletedOrUpcoming(r.status)) {
      g.lifetime_stays += 1;
      g.lifetime_nights += Number(r.nights || 0);
      g.lifetime_spend_usd += payoutToUsd(r.host_payout, r.currency, egpRate);
    }
    if (r.check_in_date) {
      g.first_seen = minIso(g.first_seen, r.check_in_date);
      g.last_seen = maxIso(g.last_seen, r.check_in_date);
      if (r.check_in_date >= todayIso) {
        g.next_arrival_at = minIso(g.next_arrival_at, r.check_in_date);
      }
    }
    const country = deriveCountryFromRaw(r.raw);
    if (country && !g.residence_country) g.residence_country = country;
  }

  return byKey;
}

// ---- Public API ----

export type SyncResult = {
  ok: boolean;
  run_id: string;
  guests_upserted: number;
  timeline_refreshed: number;
  duration_ms: number;
  error?: string;
};

export async function syncBeithadyGuests(opts: { trigger?: 'cron' | 'manual' | 'backfill' } = {}): Promise<SyncResult> {
  const sb = supabaseAdmin();
  const startedAt = Date.now();
  const trigger = opts.trigger || 'cron';

  // Open run row
  const { data: runIns, error: runErr } = await sb
    .from('beithady_crm_sync_runs')
    .insert({ trigger, status: 'running' })
    .select('id')
    .single();
  if (runErr || !runIns) {
    throw new Error(`open_run_failed: ${runErr?.message || 'unknown'}`);
  }
  const runId = (runIns as { id: string }).id;

  try {
    const egpRate = await getEgpToUsdRate();

    // Pull conversations + reservations. Beithady today has ~6.6k convs
    // and ~5k reservations — both fit in memory comfortably.
    const [convsRes, reservsRes] = await Promise.all([
      sb
        .from('guesty_conversations')
        .select(
          'guest_id, guest_full_name, guest_email, guest_phone, guest_is_returning, raw, modified_at_guesty, last_message_user_at, last_message_nonuser_at'
        )
        .not('guest_id', 'is', null),
      sb
        .from('guesty_reservations')
        .select(
          'id, status, source, guest_name, guest_email, guest_phone, check_in_date, check_out_date, nights, currency, host_payout, guest_paid, raw'
        ),
    ]);
    if (convsRes.error) throw new Error(`convs_query: ${convsRes.error.message}`);
    if (reservsRes.error) throw new Error(`reservs_query: ${reservsRes.error.message}`);

    const conversations = (convsRes.data as GuestyConvRow[] | null) || [];
    const reservations = (reservsRes.data as GuestyResRow[] | null) || [];

    const accs = await buildAccumulators(conversations, reservations, egpRate);

    // Upsert in batches of 200
    const rows = Array.from(accs.values()).map(g => ({
      guesty_guest_id: g.guesty_guest_id,
      full_name: g.full_name,
      email: g.email,
      phone_e164: g.phone_e164,
      language: g.language,
      residence_country: g.residence_country,
      lifetime_stays: g.lifetime_stays,
      lifetime_nights: g.lifetime_nights,
      lifetime_spend_usd: Math.round(g.lifetime_spend_usd * 100) / 100,
      first_seen: g.first_seen ? new Date(g.first_seen).toISOString() : null,
      last_seen: g.last_seen ? new Date(g.last_seen).toISOString() : null,
      next_arrival_at: g.next_arrival_at ? new Date(g.next_arrival_at).toISOString() : null,
      loyalty_tier: tierForStays(g.lifetime_stays),
      source_signals: g.source_signals,
    }));

    let upserted = 0;
    // Step 1: rows WITH guesty_guest_id — upsert keyed on that.
    const withId = rows.filter(r => r.guesty_guest_id);
    for (let i = 0; i < withId.length; i += 200) {
      const batch = withId.slice(i, i + 200);
      const { error } = await sb
        .from('beithady_guests')
        .upsert(batch, { onConflict: 'guesty_guest_id', ignoreDuplicates: false });
      if (error) throw new Error(`upsert_with_id: ${error.message}`);
      upserted += batch.length;
    }

    // Step 2: rows without guesty_guest_id — match by email or phone
    // before deciding insert vs update. Keeps us from duplicating
    // anonymous reservations on every run.
    const withoutId = rows.filter(r => !r.guesty_guest_id);
    for (const r of withoutId) {
      let existingId: string | null = null;
      if (r.email) {
        const { data } = await sb
          .from('beithady_guests')
          .select('id')
          .eq('email', r.email.toLowerCase())
          .limit(1)
          .maybeSingle();
        existingId = (data as { id: string } | null)?.id || null;
      }
      if (!existingId && r.phone_e164) {
        const { data } = await sb
          .from('beithady_guests')
          .select('id')
          .eq('phone_e164', r.phone_e164)
          .limit(1)
          .maybeSingle();
        existingId = (data as { id: string } | null)?.id || null;
      }
      if (existingId) {
        const { error } = await sb
          .from('beithady_guests')
          .update(r)
          .eq('id', existingId);
        if (error) throw new Error(`update_existing: ${error.message}`);
      } else {
        const { error } = await sb.from('beithady_guests').insert(r);
        if (error) throw new Error(`insert_new: ${error.message}`);
      }
      upserted += 1;
    }

    // Refresh timeline cache — limit to guests with activity in the
    // last 90 days OR an upcoming arrival OR no cache at all.
    const timelineCount = await refreshActiveTimelineCaches();

    await sb
      .from('beithady_crm_sync_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'success',
        guests_upserted: upserted,
        timeline_refreshed: timelineCount,
        details: {
          conversations_seen: conversations.length,
          reservations_seen: reservations.length,
          egp_rate: egpRate,
        },
      })
      .eq('id', runId);

    return {
      ok: true,
      run_id: runId,
      guests_upserted: upserted,
      timeline_refreshed: timelineCount,
      duration_ms: Date.now() - startedAt,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb
      .from('beithady_crm_sync_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'error',
        error: msg,
      })
      .eq('id', runId);
    return {
      ok: false,
      run_id: runId,
      guests_upserted: 0,
      timeline_refreshed: 0,
      duration_ms: Date.now() - startedAt,
      error: msg,
    };
  }
}

// Refresh timeline cache for guests with recent activity. Called from
// the sync job AND from the 360° page on first profile open if cache
// is missing/stale.
export async function refreshActiveTimelineCaches(): Promise<number> {
  const sb = supabaseAdmin();
  const cutoff = new Date(Date.now() - 90 * 86400e3).toISOString();
  const { data: guests } = await sb
    .from('beithady_guests')
    .select('id')
    .or(`last_seen.gte.${cutoff},next_arrival_at.gte.${new Date().toISOString()}`)
    .limit(2000);
  const ids = ((guests as Array<{ id: string }> | null) || []).map(g => g.id);
  let refreshed = 0;
  for (const id of ids) {
    try {
      await refreshTimelineForGuest(id);
      refreshed += 1;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[crm_sync] timeline refresh failed for ${id}:`, e);
    }
  }
  return refreshed;
}

export type TimelineEvent = {
  type: 'booking' | 'message' | 'review' | 'note';
  at: string;            // ISO
  title: string;
  meta?: Record<string, unknown>;
};

export async function refreshTimelineForGuest(guestId: string): Promise<void> {
  const sb = supabaseAdmin();
  const { data: guest } = await sb
    .from('beithady_guests')
    .select('email, phone_e164, guesty_guest_id')
    .eq('id', guestId)
    .maybeSingle();
  if (!guest) return;
  const g = guest as { email: string | null; phone_e164: string | null; guesty_guest_id: string | null };

  const events: TimelineEvent[] = [];
  let bookings = 0;
  let messages = 0;
  let reviews = 0;
  let notes = 0;

  // Bookings — match by email or phone
  if (g.email || g.phone_e164) {
    let q = sb
      .from('guesty_reservations')
      .select('id, status, source, listing_nickname, check_in_date, check_out_date, nights, currency, host_payout, created_at_odoo')
      .order('check_in_date', { ascending: false })
      .limit(200);
    if (g.email && g.phone_e164) {
      q = q.or(`guest_email.eq.${g.email.replace(/,/g, '')},guest_phone.eq.${g.phone_e164}`);
    } else if (g.email) {
      q = q.eq('guest_email', g.email);
    } else if (g.phone_e164) {
      q = q.eq('guest_phone', g.phone_e164);
    }
    const { data: rs } = await q;
    for (const r of (rs as Array<{
      id: string;
      status: string | null;
      source: string | null;
      listing_nickname: string | null;
      check_in_date: string | null;
      check_out_date: string | null;
      nights: number | null;
      currency: string | null;
      host_payout: number | null;
    }> | null) || []) {
      if (!r.check_in_date) continue;
      events.push({
        type: 'booking',
        at: new Date(r.check_in_date).toISOString(),
        title: `${r.listing_nickname || 'Reservation'} · ${r.nights ?? '?'} nights`,
        meta: {
          status: r.status,
          source: r.source,
          check_in: r.check_in_date,
          check_out: r.check_out_date,
          host_payout: r.host_payout,
          currency: r.currency,
          reservation_id: r.id,
        },
      });
      bookings += 1;
    }
  }

  // Conversations + posts (top 100 most recent posts on convs of this guest)
  if (g.guesty_guest_id) {
    const { data: convs } = await sb
      .from('guesty_conversations')
      .select('id')
      .eq('guest_id', g.guesty_guest_id)
      .limit(50);
    const convIds = ((convs as Array<{ id: string }> | null) || []).map(c => c.id);
    if (convIds.length) {
      const { data: posts } = await sb
        .from('guesty_conversation_posts')
        .select('id, conversation_id, sent_by, module_type, body_text, created_at_guesty')
        .in('conversation_id', convIds)
        .order('created_at_guesty', { ascending: false })
        .limit(100);
      for (const p of (posts as Array<{
        id: string;
        conversation_id: string;
        sent_by: string | null;
        module_type: string | null;
        body_text: string | null;
        created_at_guesty: string;
      }> | null) || []) {
        events.push({
          type: 'message',
          at: p.created_at_guesty,
          title: `${(p.module_type || 'msg').toUpperCase()} · ${p.sent_by || '?'}`,
          meta: {
            conversation_id: p.conversation_id,
            sent_by: p.sent_by,
            module_type: p.module_type,
            body: p.body_text ? p.body_text.slice(0, 280) : '',
          },
        });
        messages += 1;
      }
    }
  }

  // Reviews — match via reservation_id (we don't currently link reviews
  // to guests directly without a join; safe to skip if data is sparse).
  // For Phase B keep reviews_count = 0 unless a future enrichment adds it.

  // Internal notes (our own)
  const { data: noteRows } = await sb
    .from('beithady_guest_notes')
    .select('id, body, pinned, author_user_id, created_at')
    .eq('guest_id', guestId)
    .order('created_at', { ascending: false })
    .limit(50);
  for (const n of (noteRows as Array<{
    id: string;
    body: string;
    pinned: boolean;
    author_user_id: string | null;
    created_at: string;
  }> | null) || []) {
    events.push({
      type: 'note',
      at: n.created_at,
      title: n.pinned ? '📌 Pinned note' : 'Note',
      meta: { id: n.id, body: n.body.slice(0, 280), pinned: n.pinned, author: n.author_user_id },
    });
    notes += 1;
  }

  // Sort all events desc
  events.sort((a, b) => (b.at > a.at ? 1 : -1));

  await sb.from('beithady_guest_timeline_cache').upsert(
    {
      guest_id: guestId,
      events,
      bookings_count: bookings,
      messages_count: messages,
      reviews_count: reviews,
      notes_count: notes,
      refreshed_at: new Date().toISOString(),
    },
    { onConflict: 'guest_id' }
  );
}
