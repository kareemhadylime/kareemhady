import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { getAiConfidenceThreshold, isAiAutoReplyEnabled } from '@/lib/beithady/settings';
import { recordAudit } from '@/lib/beithady/audit';
import { sendWaCasualMessage } from '@/lib/beithady/communication/send-wa-casual';
import { isAutomationPaused } from '@/lib/beithady/automations';
import { classifyAndDraft, type Classification } from './classify';
import { gateDecision, type Decision } from './gate';

// Orchestrator: classify inbound → gate → either send + log auto_sent
// OR persist suggestion + log suggested_only/killed_*. Errors don't
// throw — they log and return.

export type AutoReplyResult = {
  ok: boolean;
  decision?: Decision;
  classification?: Classification;
  confidence?: number;
  log_id?: string;
  outbound_message_id?: string;
  error?: string;
  skipped?: string;
};

export async function processInboundForAutoReply(
  inboundMessageId: string
): Promise<AutoReplyResult> {
  // Phase C.5 follow-up — granular kill switch for AI auto-reply.
  // When paused, skip the entire orchestrator (classification, draft,
  // suggestion, send) so we don't burn API tokens or pile up suggestions.
  if (await isAutomationPaused('ai_auto_reply')) {
    return { ok: true, skipped: 'ai_auto_reply_paused' };
  }
  const sb = supabaseAdmin();

  // 1. Load message + conversation + guest
  const { data: msg } = await sb
    .from('beithady_messages')
    .select('id, channel, conversation_id, guest_id, body, sent_at, direction')
    .eq('id', inboundMessageId)
    .maybeSingle();
  if (!msg) return { ok: false, error: 'message_not_found' };
  const m = msg as {
    id: string;
    channel: 'guesty' | 'wa_cloud' | 'wa_casual';
    conversation_id: string;
    guest_id: string | null;
    body: string | null;
    sent_at: string;
    direction: string;
  };
  if (m.direction !== 'inbound') return { ok: true, skipped: 'not_inbound' };
  if (!m.body || m.body.trim().length < 2) return { ok: true, skipped: 'empty_body' };

  // Skip if we already processed this message (idempotency)
  const { data: existing } = await sb
    .from('beithady_ai_reply_log')
    .select('id')
    .eq('inbound_message_id', m.id)
    .maybeSingle();
  if (existing) return { ok: true, skipped: 'already_processed' };

  // Audit fix C-D1: per-conversation rate limit. Pre-fix, a guest who
  // sent 30 short messages in a row triggered 30 Claude calls + 30
  // outbound auto-sends in seconds — WhatsApp anti-spam ban risk on
  // the Green-API number, plus runaway AI bill, plus a guest-bot
  // ping-pong loop scenario. Cap at AI_AUTO_REPLY_MAX_PER_WINDOW
  // auto-sends per AI_AUTO_REPLY_WINDOW_MS per conversation. Counts
  // only `decision='auto_sent'` (suggested-only and killed don't
  // burn the rate limit because no message was sent to the guest).
  const AI_AUTO_REPLY_MAX_PER_WINDOW = 3;
  const AI_AUTO_REPLY_WINDOW_MS = 10 * 60 * 1000;
  const since = new Date(Date.now() - AI_AUTO_REPLY_WINDOW_MS).toISOString();
  const { count: recentSends } = await sb
    .from('beithady_ai_reply_log')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', m.conversation_id)
    .eq('decision', 'auto_sent')
    .gte('created_at', since);
  if ((recentSends ?? 0) >= AI_AUTO_REPLY_MAX_PER_WINDOW) {
    return { ok: true, skipped: 'rate_limited_per_conversation' };
  }

  const { data: conv } = await sb
    .from('beithady_conversations')
    .select('id, channel, external_id, ai_kill_switch, guest_full_name, guest_email, guest_phone, building_code, listing_nickname, source, reservation_id, archived_at, resolved_at')
    .eq('id', m.conversation_id)
    .maybeSingle();
  if (!conv) return { ok: false, error: 'conversation_not_found' };
  const c = conv as {
    id: string;
    channel: 'guesty' | 'wa_cloud' | 'wa_casual';
    external_id: string;
    ai_kill_switch: boolean;
    guest_full_name: string | null;
    guest_email: string | null;
    guest_phone: string | null;
    building_code: string | null;
    listing_nickname: string | null;
    source: string | null;
    reservation_id: string | null;
    archived_at: string | null;
    resolved_at: string | null;
  };

  // Audit fix C-D2: never auto-reply on archived/resolved conversations.
  // Pre-fix the orchestrator only checked the global + per-conv kill
  // switches; an inbound landing on an archived/resolved thread would
  // fire AI and write a new outbound on a "hidden" conversation.
  // Note: the auto-restore trigger (C-B2/B3 in migration 0070) will have
  // ALREADY cleared those columns when the inbound was inserted, so this
  // gate now only catches the rare race where the trigger hasn't fired
  // yet — defensive belt-and-suspenders.
  if (c.archived_at) return { ok: true, skipped: 'archived_conversation' };
  if (c.resolved_at) return { ok: true, skipped: 'resolved_conversation' };

  let guestVip = false;
  let guestTier: string | null = null;
  let guestCountry: string | null = null;
  let guestLanguage: string | null = null;
  if (m.guest_id) {
    const { data: g } = await sb
      .from('beithady_guests')
      .select('vip, loyalty_tier, residence_country, language')
      .eq('id', m.guest_id)
      .maybeSingle();
    if (g) {
      const gg = g as { vip: boolean; loyalty_tier: string; residence_country: string | null; language: string | null };
      guestVip = !!gg.vip;
      guestTier = gg.loyalty_tier;
      guestCountry = gg.residence_country;
      guestLanguage = gg.language;
    }
  }

  // 2. Pull recent thread (last 5 messages) for context
  const { data: recent } = await sb
    .from('beithady_messages')
    .select('direction, body, sent_at')
    .eq('conversation_id', c.id)
    .lt('sent_at', m.sent_at)
    .order('sent_at', { ascending: false })
    .limit(5);
  const recentThread = ((recent as Array<{ direction: 'inbound' | 'outbound'; body: string | null; sent_at: string }> | null) || [])
    .filter(r => !!r.body)
    .reverse()
    .map(r => ({ direction: r.direction, body: r.body || '', sent_at: r.sent_at }));

  // 3. Pull reservation if linked
  let reservationCtx: { listing_nickname: string | null; building_code: string | null; check_in: string | null; check_out: string | null; nights: number | null; source: string | null } | null = null;
  if (c.reservation_id) {
    const { data: r } = await sb
      .from('guesty_reservations')
      .select('listing_nickname, check_in_date, check_out_date, nights, source')
      .eq('id', c.reservation_id)
      .maybeSingle();
    if (r) {
      const rr = r as { listing_nickname: string | null; check_in_date: string | null; check_out_date: string | null; nights: number | null; source: string | null };
      reservationCtx = {
        listing_nickname: rr.listing_nickname || c.listing_nickname,
        building_code: c.building_code,
        check_in: rr.check_in_date,
        check_out: rr.check_out_date,
        nights: rr.nights,
        source: rr.source || c.source,
      };
    }
  } else if (c.listing_nickname || c.building_code) {
    reservationCtx = {
      listing_nickname: c.listing_nickname,
      building_code: c.building_code,
      check_in: null, check_out: null, nights: null,
      source: c.source,
    };
  }

  // 4. Classify
  let classifyResult;
  try {
    classifyResult = await classifyAndDraft({
      inboundBody: m.body,
      channel: m.channel,
      guestName: c.guest_full_name,
      guestCountry,
      guestLanguage,
      vip: guestVip,
      loyaltyTier: guestTier,
      reservation: reservationCtx,
      recentThread,
    });
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    await sb.from('beithady_ai_reply_log').insert({
      inbound_message_id: m.id,
      conversation_id: c.id,
      guest_id: m.guest_id,
      channel: m.channel,
      decision: 'error',
      raw: { error: err },
    });
    return { ok: false, error: err };
  }

  // 5. Persist classification onto the inbound message (composer reads this)
  await sb
    .from('beithady_messages')
    .update({
      ai_classification: classifyResult.classification,
      ai_confidence: classifyResult.confidence,
      ai_suggested_reply: classifyResult.suggested_reply,
    })
    .eq('id', m.id);

  // 6. Gate decision
  const [threshold, globalEnabled] = await Promise.all([
    getAiConfidenceThreshold(),
    isAiAutoReplyEnabled(),
  ]);
  const { decision, reason } = gateDecision({
    classification: classifyResult.classification,
    confidence: classifyResult.confidence,
    channel: m.channel,
    threshold,
    globalEnabled,
    killSwitchOn: !!c.ai_kill_switch,
    guestVip,
    guestLoyaltyTier: guestTier,
    hasSuggestedReply: classifyResult.suggested_reply.trim().length > 0,
  });

  // 7. Log + send if applicable
  let outboundMessageId: string | null = null;
  if (decision === 'auto_sent' && m.channel === 'wa_casual') {
    const sendResult = await sendWaCasualMessage({
      beithadyConversationId: c.id,
      body: classifyResult.suggested_reply,
      agentUserId: null,
      agentDisplayName: 'AI Assistant',
      mode: 'automatic',
    });
    if (sendResult.ok) {
      outboundMessageId = sendResult.messageId;
      // Mark the outbound row as AI-driven
      await sb
        .from('beithady_messages')
        .update({
          is_automatic: true,
          ai_classification: classifyResult.classification,
          ai_confidence: classifyResult.confidence,
          ai_used_for_auto_send: true,
        })
        .eq('id', sendResult.messageId);
    }
  }
  // Note: WA Cloud auto-send waits for Phase H WABA setup. Guesty
  // auto-send is gated to suggested_only by the gate.

  const finalDecision: Decision =
    decision === 'auto_sent' && !outboundMessageId && m.channel === 'wa_casual'
      ? 'error'
      : decision;

  const { data: logIns } = await sb
    .from('beithady_ai_reply_log')
    .insert({
      inbound_message_id: m.id,
      outbound_message_id: outboundMessageId,
      conversation_id: c.id,
      guest_id: m.guest_id,
      channel: m.channel,
      classification: classifyResult.classification,
      confidence: classifyResult.confidence,
      suggested_reply: classifyResult.suggested_reply,
      language_detected: classifyResult.language_detected,
      decision: finalDecision,
      prompt_version: classifyResult.prompt_version,
      model: classifyResult.model,
      raw: { reason, reasoning: classifyResult.reasoning, raw_classifier: classifyResult.raw },
    })
    .select('id')
    .single();

  await recordAudit({
    module: 'communication',
    action: `ai_reply_${finalDecision}`,
    target_type: 'conversation',
    target_id: c.id,
    metadata: {
      classification: classifyResult.classification,
      confidence: classifyResult.confidence,
      gate_reason: reason,
      threshold,
      vip: guestVip,
    },
  });

  return {
    ok: true,
    decision: finalDecision,
    classification: classifyResult.classification,
    confidence: classifyResult.confidence,
    log_id: (logIns as { id: string } | null)?.id,
    outbound_message_id: outboundMessageId || undefined,
  };
}

// Manual trigger: classify a message without sending. Used by ops to
// tune thresholds + by the suggestion-strip's regenerate button.
export async function reclassify(inboundMessageId: string): Promise<AutoReplyResult> {
  const sb = supabaseAdmin();
  // Soft-delete any prior log for this message so processInbound runs again
  await sb.from('beithady_ai_reply_log').delete().eq('inbound_message_id', inboundMessageId);
  return processInboundForAutoReply(inboundMessageId);
}

// Pull pending suggestion for a conversation (latest unactioned). Used
// by the composer to render the suggestion strip.
export async function getPendingSuggestion(conversationId: string): Promise<{
  log_id: string;
  classification: string;
  confidence: number;
  suggested_reply: string;
  language: string;
  inbound_body: string;
} | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_pending_suggestions')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  const r = data as {
    log_id: string;
    classification: string;
    confidence: number;
    suggested_reply: string;
    language_detected: string;
    inbound_body: string;
  };
  return {
    log_id: r.log_id,
    classification: r.classification,
    confidence: Number(r.confidence),
    suggested_reply: r.suggested_reply,
    language: r.language_detected,
    inbound_body: r.inbound_body,
  };
}
