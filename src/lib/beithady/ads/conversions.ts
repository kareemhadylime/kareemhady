import 'server-only';
import { createHash } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabase';
import { loadMetaCredentials } from './meta-client';
import { getCredential } from '@/lib/credentials';
import { convertToUsd } from '@/lib/fx-rates';

// Meta Conversions API (server-side Pixel). Sends Lead + Purchase events
// per ads_conversion_events_log row. Hashes PII per Meta's spec before
// transmitting (SHA-256, lowercased, trimmed, no normalization beyond
// what Meta requires).
//
// Endpoint: POST https://graph.facebook.com/v21.0/{pixel_id}/events
// Auth:     ?access_token=<system_user_token>  (must have ads_management)
// Dedup:    event_id matches a Pixel event fired on the booking page
//
// Phase H+ v1: Meta only. Google Offline Conversions and TikTok Events
// API are queue-aware no-ops (status='skipped') until those platforms'
// conversion_action_id / pixel_id are configured.

const API_VERSION = 'v21.0';
const META_GRAPH = `https://graph.facebook.com/${API_VERSION}`;

function sha256Hex(input: string): string {
  return createHash('sha256').update(input.trim().toLowerCase()).digest('hex');
}

type ConversionEventRow = {
  id: number;
  lead_id: number | null;
  reservation_id: string | null;
  platform: 'meta' | 'google' | 'tiktok';
  event_type: 'Lead' | 'Purchase' | 'CompleteRegistration' | 'InitiateCheckout';
  event_id: string;
  event_time: string;
  value_usd: number | null;
  currency: string | null;
};

type LeadPii = {
  phone_e164: string | null;
  email: string | null;
  country: string | null;
  full_name: string | null;
  raw_payload: Record<string, unknown> | null;
};

export type FlushResult = {
  ok: boolean;
  picked: number;
  sent: number;
  errored: number;
  skipped: number;
  duration_ms: number;
  per_event: Array<{ event_id: string; platform: string; status: string; error?: string }>;
};

export async function flushPendingConversions(maxBatch = 50): Promise<FlushResult> {
  const sb = supabaseAdmin();
  const t0 = Date.now();
  const { data: pendingRaw } = await sb
    .from('ads_conversion_events_log')
    .select('id, lead_id, reservation_id, platform, event_type, event_id, event_time, value_usd, currency')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(maxBatch);
  const pending = (pendingRaw as ConversionEventRow[] | null) || [];

  let sent = 0, errored = 0, skipped = 0;
  const perEvent: FlushResult['per_event'] = [];

  for (const evt of pending) {
    let leadPii: LeadPii | null = null;
    if (evt.lead_id != null) {
      const { data: lead } = await sb
        .from('ads_leads')
        .select('phone_e164, email, country, full_name, raw_payload')
        .eq('id', evt.lead_id)
        .maybeSingle();
      leadPii = lead as LeadPii | null;
    }

    if (evt.platform === 'meta') {
      const r = await sendMetaConversion(evt, leadPii);
      if (r.status === 'sent') sent += 1;
      else if (r.status === 'error') errored += 1;
      else skipped += 1;
      await sb.from('ads_conversion_events_log').update({
        status: r.status,
        response: (r.response || null) as object,
        error: r.error || null,
        raw_payload: (r.payload || null) as object,
        sent_at: r.status === 'sent' ? new Date().toISOString() : null,
      }).eq('id', evt.id);
      perEvent.push({ event_id: evt.event_id, platform: 'meta', status: r.status, error: r.error });
    } else {
      // Google + TikTok: skip until conversion-action wiring lands
      await sb.from('ads_conversion_events_log').update({
        status: 'skipped',
        error: 'platform_handler_not_implemented_yet',
      }).eq('id', evt.id);
      skipped += 1;
      perEvent.push({ event_id: evt.event_id, platform: evt.platform, status: 'skipped' });
    }
  }

  return {
    ok: errored === 0,
    picked: pending.length,
    sent,
    errored,
    skipped,
    duration_ms: Date.now() - t0,
    per_event: perEvent,
  };
}

async function sendMetaConversion(
  evt: ConversionEventRow,
  pii: LeadPii | null
): Promise<{ status: 'sent' | 'error' | 'skipped'; response?: unknown; error?: string; payload?: unknown }> {
  const creds = await loadMetaCredentials();
  if (!creds.ok) return { status: 'skipped', error: 'meta_credentials_missing' };
  const pixelId = (await getCredential('meta_marketing', 'pixel_id')) || process.env.META_PIXEL_ID || '';
  if (!pixelId) return { status: 'skipped', error: 'meta_pixel_id_missing' };

  // Build the user_data object — hashed PII per Meta spec
  const userData: Record<string, unknown> = {};
  if (pii?.email) userData.em = [sha256Hex(pii.email)];
  if (pii?.phone_e164) userData.ph = [sha256Hex(pii.phone_e164.replace(/[^0-9]/g, ''))];
  if (pii?.country) userData.country = [sha256Hex(pii.country.slice(0, 2))];
  if (pii?.full_name) {
    const parts = pii.full_name.trim().split(/\s+/);
    if (parts[0]) userData.fn = [sha256Hex(parts[0])];
    if (parts.length > 1) userData.ln = [sha256Hex(parts[parts.length - 1])];
  }
  // Pull fbp / fbc from raw_payload if present (Meta Lead Ads webhook includes these)
  const fbpFromRaw = pickFbCookie(pii?.raw_payload, 'fbp');
  const fbcFromRaw = pickFbCookie(pii?.raw_payload, 'fbc');
  if (fbpFromRaw) userData.fbp = fbpFromRaw;
  if (fbcFromRaw) userData.fbc = fbcFromRaw;

  // Convert booking value to USD if a non-USD currency came through
  let valueUsd = evt.value_usd ? Number(evt.value_usd) : null;
  if (valueUsd != null && evt.currency && evt.currency !== 'USD') {
    valueUsd = await convertToUsd(valueUsd, evt.currency);
  }

  const customData: Record<string, unknown> = {};
  if (valueUsd != null && valueUsd > 0) {
    customData.value = Number(valueUsd.toFixed(2));
    customData.currency = 'USD';
  }
  if (evt.reservation_id) customData.order_id = evt.reservation_id;

  const eventPayload = {
    event_name: evt.event_type,
    event_time: Math.floor(new Date(evt.event_time).getTime() / 1000),
    event_id: evt.event_id,
    action_source: 'system_generated',
    user_data: userData,
    custom_data: customData,
  };
  const body = { data: [eventPayload], partner_agent: 'limeinc-bh-ads-capi/1.0' };

  try {
    const url = `${META_GRAPH}/${pixelId}/events?access_token=${encodeURIComponent(creds.creds.token)}`;
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (!r.ok || j.error) {
      const errMsg = (j.error as { message?: string } | undefined)?.message || `http_${r.status}`;
      return { status: 'error', response: j, error: errMsg, payload: body };
    }
    return { status: 'sent', response: j, payload: body };
  } catch (e) {
    return { status: 'error', error: e instanceof Error ? e.message : String(e), payload: body };
  }
}

function pickFbCookie(raw: Record<string, unknown> | null | undefined, key: 'fbp' | 'fbc'): string | undefined {
  if (!raw) return undefined;
  if (typeof raw[key] === 'string') return String(raw[key]);
  const fb = raw['fb'] as Record<string, unknown> | undefined;
  if (fb && typeof fb[key] === 'string') return String(fb[key]);
  return undefined;
}
