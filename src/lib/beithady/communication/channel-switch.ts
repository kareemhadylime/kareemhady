import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { getProviderEnabled } from '@/lib/credentials';
import { getGreenInstanceState, isGreenApiPhoneValid } from '@/lib/whatsapp/green-api';
import { sendGuestyMessage, type SendGuestyResult } from './send-guesty';
import { sendWaCasualMessage, type SendWaCasualResult } from './send-wa-casual';
import { sendWaCloudMessage, type SendWaCloudResult } from './send-wa-cloud';

// Phase C.5 — Channel Switcher dispatcher.
//
// Lets the agent redirect an outbound message mid-thread to a transport
// that is NOT the conversation's home channel. The conversation row + its
// thread view stay intact (Q4-a in the plan: cross-channel sends inject
// into the current thread with a "via X" badge).
//
// Targets supported today (Q2-a):
//   - guesty_email      → Guesty Open API, module=email   (only on guesty home)
//   - guesty_sms        → Guesty Open API, module=sms     (only on guesty home, source-gated)
//   - guesty_whatsapp   → Guesty Open API, module=whatsapp(only on guesty home)
//   - wa_casual         → Green-API sendMessage / sendFileByUrl
//   - wa_cloud          → WABA stub (501 until C.4)
//
// Standalone email_/sms_ providers are out of scope for C.5.

export type ChannelTarget =
  | 'guesty_email'
  | 'guesty_sms'
  | 'guesty_whatsapp'
  | 'wa_casual'
  | 'wa_cloud'
  | 'email_standalone'  // future
  | 'sms_standalone';   // future

export type HomeChannel = 'guesty' | 'wa_cloud' | 'wa_casual';

// What the dispatcher needs to know about a conversation to validate +
// route a switched send. Subset of beithady_conversations columns +
// beithady_guests fallback fields.
export type ChannelSwitchContext = {
  conversationId: string;
  homeChannel: HomeChannel;
  externalId: string;            // Guesty conversation id OR WA phone, etc.
  source: string | null;         // airbnb / booking.com / direct / sms / email / whatsapp
  guestId: string | null;
  guestPhone: string | null;     // E.164 with or without '+'
  guestEmail: string | null;
};

export type ResolveOk = {
  ok: true;
  target: ChannelTarget;
  contact: { phone?: string; email?: string };
  // What the UI should show in the active-channel pill.
  display: string;
};

export type ResolveErr = {
  ok: false;
  reason:
    | 'no_phone'
    | 'no_email'
    | 'provider_disabled'
    | 'green_offline'
    | 'wrong_home_channel'
    | 'invalid_phone'
    | 'unknown_target';
  hint?: string;
};

// =====================================================================
// F1 — resolveTargetChannel
// =====================================================================
// Validates contact info + provider availability. Returns the resolved
// phone or email + a display string for the pill. Does NOT send.
export async function resolveTargetChannel(
  ctx: ChannelSwitchContext,
  target: ChannelTarget,
): Promise<ResolveOk | ResolveErr> {
  // Source gating for Guesty cross-module — Airbnb/Booking conversations
  // don't have an SMS module on the Guesty side. Email + WhatsApp are
  // generally supported but the agent's PF1 was skipped this turn so we
  // surface a hint not a hard block.
  const src = (ctx.source || '').toLowerCase();

  switch (target) {
    case 'guesty_email': {
      if (ctx.homeChannel !== 'guesty') {
        return { ok: false, reason: 'wrong_home_channel', hint: 'Email-via-Guesty only available on Guesty conversations.' };
      }
      if (!ctx.guestEmail) return { ok: false, reason: 'no_email' };
      return { ok: true, target, contact: { email: ctx.guestEmail }, display: `Email · ${ctx.guestEmail}` };
    }
    case 'guesty_sms': {
      if (ctx.homeChannel !== 'guesty') {
        return { ok: false, reason: 'wrong_home_channel', hint: 'SMS-via-Guesty only available on Guesty conversations.' };
      }
      if (src.includes('airbnb') || src.includes('booking')) {
        return { ok: false, reason: 'wrong_home_channel', hint: 'Airbnb / Booking.com threads do not have an SMS sub-channel in Guesty.' };
      }
      if (!ctx.guestPhone) return { ok: false, reason: 'no_phone' };
      return { ok: true, target, contact: { phone: ctx.guestPhone }, display: `SMS · ${ctx.guestPhone}` };
    }
    case 'guesty_whatsapp': {
      if (ctx.homeChannel !== 'guesty') {
        return { ok: false, reason: 'wrong_home_channel', hint: 'WhatsApp-via-Guesty only available on Guesty conversations.' };
      }
      if (!ctx.guestPhone) return { ok: false, reason: 'no_phone' };
      return { ok: true, target, contact: { phone: ctx.guestPhone }, display: `WhatsApp · ${ctx.guestPhone}` };
    }
    case 'wa_casual': {
      const enabled = await getProviderEnabled('green');
      if (!enabled) return { ok: false, reason: 'provider_disabled', hint: 'Green-API not configured in Settings → Integrations.' };
      // Phone source: prefer conversation column; fall back to external_id
      // for wa_casual home (since external_id IS the phone there).
      const phone = ctx.guestPhone || (ctx.homeChannel === 'wa_casual' ? ctx.externalId : null);
      if (!phone) return { ok: false, reason: 'no_phone' };
      if (!isGreenApiPhoneValid(phone)) return { ok: false, reason: 'invalid_phone' };
      return { ok: true, target, contact: { phone }, display: `WA Casual · ${phone}` };
    }
    case 'wa_cloud': {
      const enabled = await getProviderEnabled('meta_waba');
      if (!enabled) return { ok: false, reason: 'provider_disabled', hint: 'Beit Hady WABA not yet provisioned (Phase C.4).' };
      const phone = ctx.guestPhone || (ctx.homeChannel === 'wa_casual' ? ctx.externalId : null);
      if (!phone) return { ok: false, reason: 'no_phone' };
      if (!isGreenApiPhoneValid(phone)) return { ok: false, reason: 'invalid_phone' };
      return { ok: true, target, contact: { phone }, display: `WABA · ${phone}` };
    }
    default:
      return { ok: false, reason: 'unknown_target' };
  }
}

// =====================================================================
// F2 — sendViaChannel (dispatcher)
// =====================================================================
export type DispatchPayload = {
  beithadyConversationId: string;
  body: string;
  attachments?: Array<{ url: string; name: string; mime: string }>;
  fileUrl?: string;
  fileName?: string;
  fileMime?: string;
  agentUserId: string | null;
  agentDisplayName?: string | null;
  // Phase C.5 follow-up — manual kill switch gating mode.
  mode?: 'manual' | 'automatic';
  // Audit fix H-C3: pass cross-channel info into the send path so the
  // beithady_messages row is INSERTED with was_channel_switched +
  // original_thread_channel set atomically. Pre-fix actions.ts did a
  // post-insert UPDATE which left a race window where webhook ingest
  // / realtime subscribers saw the row with the default false / null.
  wasChannelSwitched?: boolean;
  originalThreadChannel?: string | null;
};

export type DispatchResult =
  | { ok: true; provider: 'guesty' | 'wa_casual' | 'wa_cloud'; messageId: string; providerMessageId: string | null }
  | { ok: false; provider: 'guesty' | 'wa_casual' | 'wa_cloud'; status: number; error: string; fallbackUrl?: string };

export async function sendViaChannel(
  target: ChannelTarget,
  payload: DispatchPayload,
): Promise<DispatchResult> {
  switch (target) {
    case 'guesty_email':
    case 'guesty_sms':
    case 'guesty_whatsapp': {
      const moduleVal = target === 'guesty_email' ? 'email' : target === 'guesty_sms' ? 'sms' : 'whatsapp';
      const r: SendGuestyResult = await sendGuestyMessage({
        beithadyConversationId: payload.beithadyConversationId,
        body: payload.body,
        module: moduleVal,
        attachments: payload.attachments,
        agentUserId: payload.agentUserId,
        agentDisplayName: payload.agentDisplayName,
        mode: payload.mode,
        wasChannelSwitched: payload.wasChannelSwitched,
        originalThreadChannel: payload.originalThreadChannel,
      });
      if (r.ok) return { ok: true, provider: 'guesty', messageId: r.messageId, providerMessageId: r.externalId };
      return { ok: false, provider: 'guesty', status: r.status, error: r.error, fallbackUrl: r.fallbackUrl };
    }
    case 'wa_casual': {
      const r: SendWaCasualResult = await sendWaCasualMessage({
        beithadyConversationId: payload.beithadyConversationId,
        body: payload.body,
        fileUrl: payload.fileUrl,
        fileName: payload.fileName,
        fileMime: payload.fileMime,
        agentUserId: payload.agentUserId,
        agentDisplayName: payload.agentDisplayName,
        mode: payload.mode,
        wasChannelSwitched: payload.wasChannelSwitched,
        originalThreadChannel: payload.originalThreadChannel,
      });
      if (r.ok) return { ok: true, provider: 'wa_casual', messageId: r.messageId, providerMessageId: r.providerMessageId };
      return { ok: false, provider: 'wa_casual', status: r.status, error: r.error };
    }
    case 'wa_cloud': {
      const r: SendWaCloudResult = await sendWaCloudMessage({
        beithadyConversationId: payload.beithadyConversationId,
        body: payload.body,
        fileUrl: payload.fileUrl,
        fileName: payload.fileName,
        fileMime: payload.fileMime,
        agentUserId: payload.agentUserId,
        agentDisplayName: payload.agentDisplayName,
      });
      if (r.ok) return { ok: true, provider: 'wa_cloud', messageId: r.messageId, providerMessageId: r.providerMessageId };
      return { ok: false, provider: 'wa_cloud', status: r.status, error: r.error };
    }
    default:
      return { ok: false, provider: 'guesty', status: 400, error: `unsupported_target:${target}` };
  }
}

// =====================================================================
// F4 — getAvailableChannels
// =====================================================================
// One-shot capability matrix used by the channel-switcher UI.
// Per target: live | needs-info | provider-down | unsupported, plus a
// last-used timestamp for the "★ replied here Nh ago" badge.
export type ChannelAvailability = {
  target: ChannelTarget;
  available: boolean;
  reason?: ResolveErr['reason'];
  hint?: string;
  lastUsedAt?: string | null;
  lastInboundAt?: string | null;
  costHint?: string;          // improvement #7
  attachmentsSupported: boolean;
  voiceSupported: boolean;
};

const SHOW_TARGETS: ChannelTarget[] = [
  'wa_casual',
  'wa_cloud',
  'guesty_email',
  'guesty_sms',
  // Note: guesty_whatsapp is the implicit "current" path on Guesty home —
  // surfaced only when home is wa_casual/wa_cloud and we'd want to deflect
  // back into Guesty WhatsApp (rare; not surfaced as a button for now).
];

export async function getAvailableChannels(
  ctx: ChannelSwitchContext,
): Promise<ChannelAvailability[]> {
  const sb = supabaseAdmin();

  // Last-used + last-inbound per channel for this guest (improvement #2).
  // Single query, partial index 0055 backs it.
  const { data: msgRows } = ctx.guestId
    ? await sb
        .from('beithady_messages')
        .select('channel, direction, sent_at, module_type')
        .eq('guest_id', ctx.guestId)
        .order('sent_at', { ascending: false, nullsFirst: false })
        .limit(50)
    : { data: null as null };

  const lastUsed = new Map<ChannelTarget, string>();
  const lastInbound = new Map<ChannelTarget, string>();
  for (const r of (msgRows || []) as Array<{ channel: string; direction: string; sent_at: string | null; module_type: string | null }>) {
    if (!r.sent_at) continue;
    const targets = mapMessageRowToTargets(r);
    for (const t of targets) {
      if (r.direction === 'outbound' && !lastUsed.has(t)) lastUsed.set(t, r.sent_at);
      if (r.direction === 'inbound' && !lastInbound.has(t)) lastInbound.set(t, r.sent_at);
    }
  }

  // Live provider gates — fetch in parallel.
  const [greenEnabled, wabaEnabled, greenState] = await Promise.all([
    getProviderEnabled('green'),
    getProviderEnabled('meta_waba'),
    safeGreenState(),
  ]);

  const out: ChannelAvailability[] = [];
  for (const target of SHOW_TARGETS) {
    const resolved = await resolveTargetChannel(ctx, target);
    const lastUsedAt = lastUsed.get(target) || null;
    const lastInboundAt = lastInbound.get(target) || null;
    const base = {
      target,
      lastUsedAt,
      lastInboundAt,
      attachmentsSupported: target !== 'guesty_sms',
      voiceSupported: target === 'wa_casual' || target === 'wa_cloud' || target === 'guesty_whatsapp',
      costHint: target === 'guesty_sms' ? 'SMS via Guesty — may incur per-segment cost'
              : target === 'wa_cloud'   ? 'WABA marketing templates billed per send'
              : undefined,
    };
    if (resolved.ok) {
      // Extra runtime gate: green-state offline → flag as not-available.
      if (target === 'wa_casual' && greenEnabled && greenState === 'offline') {
        out.push({ ...base, available: false, reason: 'green_offline', hint: 'Green-API instance is offline.' });
        continue;
      }
      out.push({ ...base, available: true });
    } else {
      // Surface provider-disabled separately for buttons that should be
      // disabled-but-visible (Q5-a for WABA).
      const reason = resolved.reason;
      const hint = resolved.hint;
      out.push({ ...base, available: false, reason, hint });
    }
    // Mark unused for now to silence lint where these aren't read.
    void greenEnabled; void wabaEnabled;
  }
  return out;
}

function mapMessageRowToTargets(r: { channel: string; module_type: string | null }): ChannelTarget[] {
  if (r.channel === 'wa_casual') return ['wa_casual'];
  if (r.channel === 'wa_cloud')  return ['wa_cloud'];
  if (r.channel === 'guesty') {
    const m = (r.module_type || '').toLowerCase();
    if (m === 'email')    return ['guesty_email'];
    if (m === 'sms')      return ['guesty_sms'];
    if (m === 'whatsapp') return ['guesty_whatsapp'];
    return ['guesty_whatsapp'];
  }
  return [];
}

async function safeGreenState(): Promise<'online' | 'offline' | 'unknown'> {
  try {
    const r = await getGreenInstanceState();
    if (!r.ok) return 'unknown';
    // Green-API 'authorized' = ready; everything else = not ready.
    return r.stateInstance === 'authorized' ? 'online' : 'offline';
  } catch {
    return 'unknown';
  }
}

// =====================================================================
// F5 — setPreferredChannel
// =====================================================================
export async function setPreferredChannel(
  conversationId: string,
  target: ChannelTarget | null,
): Promise<{ ok: boolean; error?: string }> {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('beithady_conversations')
    .update({
      preferred_outbound_channel: target,
      preferred_outbound_set_at: target ? new Date().toISOString() : null,
    })
    .eq('id', conversationId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// =====================================================================
// Helpers exposed for the UI
// =====================================================================
export function homeChannelToDefaultTarget(home: HomeChannel, source: string | null): ChannelTarget {
  if (home === 'wa_casual') return 'wa_casual';
  if (home === 'wa_cloud')  return 'wa_cloud';
  // Guesty home → infer from source.
  const s = (source || '').toLowerCase();
  if (s.includes('whatsapp')) return 'guesty_whatsapp';
  if (s.includes('email'))    return 'guesty_email';
  if (s.includes('sms'))      return 'guesty_sms';
  // Airbnb / Booking / direct → use the WhatsApp module (most common
  // outbound for Beithady ops).
  return 'guesty_whatsapp';
}

export function targetIsCrossChannel(target: ChannelTarget, home: HomeChannel): boolean {
  if (home === 'guesty') {
    return target !== 'guesty_email' && target !== 'guesty_sms' && target !== 'guesty_whatsapp';
  }
  if (home === 'wa_casual') return target !== 'wa_casual';
  if (home === 'wa_cloud')  return target !== 'wa_cloud';
  return true;
}

// "Hours since last inbound" for the WABA 24h-window enforcement (Q6).
export function hoursSinceLastInbound(lastInboundAt: string | null): number | null {
  if (!lastInboundAt) return null;
  const ms = Date.now() - new Date(lastInboundAt).getTime();
  if (Number.isNaN(ms) || ms < 0) return null;
  return ms / 3_600_000;
}
