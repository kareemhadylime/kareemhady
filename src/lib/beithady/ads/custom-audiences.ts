import 'server-only';
import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { loadMetaCredentials, metaPost, metaGet } from './meta-client';
import { recordAudit } from '@/lib/beithady/audit';

// Meta Customer Match — syncs hashed PII of Beithady guests into a saved
// audience inside the ad account. Operators then build a 1% lookalike on
// top in Ads Manager UI (Meta requires the audience to season for ~24h
// before lookalikes can be generated — that's a one-time setup the
// operator does in Meta's UI).
//
// Two named segments are maintained:
//   - bh_past_guests:  every beithady_guests row with lifetime_stays >= 1
//   - bh_vip:          beithady_guests where loyalty_tier in ('gold','platinum') or vip = true
//
// Schedule: weekly. The audiences are persistent — only members are
// added/updated, never silently deleted (Meta has its own rolling window).

const PII_FIELDS = ['EMAIL', 'PHONE', 'FN', 'LN', 'COUNTRY'] as const;
type PiiSchemaField = (typeof PII_FIELDS)[number];

export type CustomAudienceSegment = {
  key: 'bh_past_guests' | 'bh_vip';
  display_name: string;
  description: string;
};

const SEGMENTS: CustomAudienceSegment[] = [
  {
    key: 'bh_past_guests',
    display_name: 'BH — Past guests (Lime)',
    description: 'Auto-synced from beithady_guests where lifetime_stays >= 1. Source for 1% lookalike.',
  },
  {
    key: 'bh_vip',
    display_name: 'BH — VIP / Loyalty (Lime)',
    description: 'Gold + Platinum tier + manually flagged VIPs. Use for retention or LAL with smaller seed.',
  },
];

function sha256Hex(input: string): string {
  return createHash('sha256').update(input.trim().toLowerCase()).digest('hex');
}

// Read the saved Meta audience_id for a segment (kept in
// integration_credentials.meta_marketing.config under
// 'audience_id_<segment_key>').
async function getAudienceId(segmentKey: string): Promise<string | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('integration_credentials')
    .select('config')
    .eq('provider', 'meta_marketing')
    .maybeSingle();
  const cfg = (data as { config?: Record<string, string> } | null)?.config || {};
  const v = cfg[`audience_id_${segmentKey}`];
  return v && String(v).trim() ? String(v) : null;
}

async function saveAudienceId(segmentKey: string, audienceId: string): Promise<void> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('integration_credentials')
    .select('config')
    .eq('provider', 'meta_marketing')
    .maybeSingle();
  const cfg = { ...((data as { config?: Record<string, string> } | null)?.config || {}) };
  cfg[`audience_id_${segmentKey}`] = audienceId;
  await sb.from('integration_credentials').upsert(
    { provider: 'meta_marketing', config: cfg, enabled: true },
    { onConflict: 'provider' }
  );
}

// Create the saved audience shell if it doesn't exist. Returns its ID.
async function ensureAudience(segment: CustomAudienceSegment): Promise<
  | { ok: true; audience_id: string; created: boolean }
  | { ok: false; error: string }
> {
  let id = await getAudienceId(segment.key);
  if (id) return { ok: true, audience_id: id, created: false };

  const creds = await loadMetaCredentials();
  if (!creds.ok) return { ok: false, error: creds.error };

  const r = await metaPost<{ id: string }>(
    `${creds.creds.adAccountId}/customaudiences`,
    {
      name: segment.display_name,
      description: segment.description,
      subtype: 'CUSTOM',
      customer_file_source: 'USER_PROVIDED_ONLY',
    },
    creds.creds.token
  );
  if (!r.ok) return { ok: false, error: r.error };
  id = (r.data as { id: string }).id;
  await saveAudienceId(segment.key, id);
  return { ok: true, audience_id: id, created: true };
}

type GuestRow = {
  email: string | null;
  phone_e164: string | null;
  full_name: string | null;
  residence_country: string | null;
  lifetime_stays: number | null;
  loyalty_tier: string | null;
  vip: boolean | null;
};

async function fetchGuestsForSegment(segmentKey: string): Promise<GuestRow[]> {
  const sb = supabaseAdmin();
  let q = sb
    .from('beithady_guests')
    .select('email, phone_e164, full_name, residence_country, lifetime_stays, loyalty_tier, vip');
  if (segmentKey === 'bh_past_guests') {
    q = q.gte('lifetime_stays', 1);
  } else if (segmentKey === 'bh_vip') {
    q = q.or('vip.eq.true,loyalty_tier.in.(gold,platinum)');
  }
  const { data } = await q.limit(50_000);
  return (data as GuestRow[] | null) || [];
}

function hashGuestRow(g: GuestRow): string[] {
  const out: string[] = [];
  out.push(g.email ? sha256Hex(g.email) : '');
  out.push(g.phone_e164 ? sha256Hex(g.phone_e164.replace(/[^0-9]/g, '')) : '');
  const parts = (g.full_name || '').trim().split(/\s+/);
  out.push(parts[0] ? sha256Hex(parts[0]) : '');
  out.push(parts.length > 1 ? sha256Hex(parts[parts.length - 1]) : '');
  out.push(g.residence_country ? sha256Hex(g.residence_country.slice(0, 2)) : '');
  return out;
}

export type AudienceSyncResult = {
  ok: boolean;
  segment: string;
  audience_id: string | null;
  rows_pushed: number;
  invalid_rows: number;
  error?: string;
};

export async function syncCustomAudience(segmentKey: 'bh_past_guests' | 'bh_vip'): Promise<AudienceSyncResult> {
  const segment = SEGMENTS.find(s => s.key === segmentKey);
  if (!segment) return { ok: false, segment: segmentKey, audience_id: null, rows_pushed: 0, invalid_rows: 0, error: 'unknown_segment' };

  const ensured = await ensureAudience(segment);
  if (!ensured.ok) return { ok: false, segment: segmentKey, audience_id: null, rows_pushed: 0, invalid_rows: 0, error: ensured.error };

  const creds = await loadMetaCredentials();
  if (!creds.ok) return { ok: false, segment: segmentKey, audience_id: ensured.audience_id, rows_pushed: 0, invalid_rows: 0, error: creds.error };

  const guests = await fetchGuestsForSegment(segmentKey);
  // Skip rows that have neither email nor phone (Meta needs at least one)
  const valid = guests.filter(g => !!(g.email || g.phone_e164));
  const invalid = guests.length - valid.length;
  const data = valid.map(hashGuestRow);

  if (data.length === 0) {
    return { ok: true, segment: segmentKey, audience_id: ensured.audience_id, rows_pushed: 0, invalid_rows: invalid };
  }

  // Push in batches of 5000 (Meta's per-request limit is 10000, we stay
  // under to keep payload size reasonable)
  let pushed = 0;
  for (let i = 0; i < data.length; i += 5000) {
    const chunk = data.slice(i, i + 5000);
    const payload = {
      schema: PII_FIELDS as readonly PiiSchemaField[],
      data: chunk,
    };
    const r = await metaPost(
      `${ensured.audience_id}/users`,
      { payload: JSON.stringify(payload) },
      creds.creds.token
    );
    if (!r.ok) {
      return {
        ok: false,
        segment: segmentKey,
        audience_id: ensured.audience_id,
        rows_pushed: pushed,
        invalid_rows: invalid,
        error: r.error,
      };
    }
    pushed += chunk.length;
  }

  await recordAudit({
    module: 'ads',
    action: 'custom_audience_synced',
    target_type: 'meta_audience',
    target_id: ensured.audience_id,
    metadata: { segment: segmentKey, rows_pushed: pushed, invalid_rows: invalid },
  });

  return { ok: true, segment: segmentKey, audience_id: ensured.audience_id, rows_pushed: pushed, invalid_rows: invalid };
}

export async function syncAllCustomAudiences(): Promise<AudienceSyncResult[]> {
  return Promise.all(SEGMENTS.map(s => syncCustomAudience(s.key)));
}

// Inspect — read the audience size + approximate match rate from Meta.
export async function getAudienceStatus(segmentKey: 'bh_past_guests' | 'bh_vip'): Promise<
  | { ok: true; audience_id: string | null; approximate_count: number | null; data_source?: unknown }
  | { ok: false; error: string }
> {
  const id = await getAudienceId(segmentKey);
  if (!id) return { ok: true, audience_id: null, approximate_count: null };
  const creds = await loadMetaCredentials();
  if (!creds.ok) return { ok: false, error: creds.error };
  const r = await metaGet<{ approximate_count?: number; data_source?: unknown }>(
    `${id}?fields=name,approximate_count,data_source,delivery_status`,
    creds.creds.token
  );
  if (!r.ok) return { ok: false, error: r.error };
  return {
    ok: true,
    audience_id: id,
    approximate_count: (r.data as { approximate_count?: number }).approximate_count ?? null,
    data_source: (r.data as { data_source?: unknown }).data_source,
  };
}

export { SEGMENTS };
