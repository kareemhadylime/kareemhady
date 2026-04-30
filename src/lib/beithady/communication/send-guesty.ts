import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { sendGuestyConversationPost } from '@/lib/guesty';
import { recordAudit } from '@/lib/beithady/audit';
import { isManualOutboundPaused } from '@/lib/beithady/automations';

// Server-side wrapper around sendGuestyConversationPost. Persists the
// outbound message into beithady_messages (channel=guesty, direction=
// outbound, sent_by_user_id), updates the parent conversation's
// last_outbound_at + clears SLA, and records an audit row.

export type SendGuestyArgs = {
  beithadyConversationId: string;     // beithady_conversations.id (uuid)
  body: string;
  module?: 'email' | 'sms' | 'whatsapp' | 'log' | 'airbnb2' | 'bookingCom';
  subject?: string;
  agentUserId: string | null;
  agentDisplayName?: string | null;
  // Phase Q.3 — multi-attachment support per Q.0 finding (Guesty Open API
  // already accepts attachments[] on conversation-posts).
  attachments?: Array<{ url: string; name: string; mime: string }>;
  // Phase C.5 follow-up — call mode. 'manual' (default) gates on the
  // manual kill switch; 'automatic' bypasses it (caller is responsible
  // for gating its own automation kill switch via isAutomationPaused).
  mode?: 'manual' | 'automatic';
};

export type SendGuestyResult =
  | { ok: true; messageId: string; externalId: string | null }
  | { ok: false; status: number; error: string; fallbackUrl?: string };

export async function sendGuestyMessage(args: SendGuestyArgs): Promise<SendGuestyResult> {
  // Phase C.5 follow-up — manual kill switch only gates manual paths.
  // Automation paths gate their own kill switch at the orchestrator
  // layer (isAutomationPaused) and pass mode='automatic' to bypass.
  const mode = args.mode || 'manual';
  if (mode === 'manual' && (await isManualOutboundPaused())) {
    await recordAudit({
      actor_user_id: args.agentUserId,
      module: 'communication',
      action: 'send_guesty_blocked_killswitch',
      target_type: 'conversation',
      target_id: args.beithadyConversationId,
      metadata: { reason: 'beithady_pause_manual_outbound=true', body_length: args.body.length },
    });
    return { ok: false, status: 503, error: 'manual_outbound_paused' };
  }

  const sb = supabaseAdmin();

  // Resolve the beithady conversation to its Guesty external id.
  const { data: conv } = await sb
    .from('beithady_conversations')
    .select('id, channel, external_id, guest_id, reservation_id, building_code, listing_id')
    .eq('id', args.beithadyConversationId)
    .maybeSingle();
  if (!conv) {
    return { ok: false, status: 404, error: 'conversation_not_found' };
  }
  const c = conv as {
    id: string; channel: string; external_id: string;
    guest_id: string | null; reservation_id: string | null;
    building_code: string | null; listing_id: string | null;
  };
  if (c.channel !== 'guesty') {
    return { ok: false, status: 400, error: 'wrong_channel_use_dedicated_path' };
  }

  // Send via Guesty Open API. `type` is no longer sent (Guesty rejects
  // it as VALIDATION_ERROR since 2026-04-30); the helper ignores the
  // field but we leave it off the payload for clarity.
  const result = await sendGuestyConversationPost({
    conversationId: c.external_id,
    body: args.body,
    module: args.module,
    subject: args.subject,
    attachments: args.attachments,
  });

  if (!result.ok) {
    await recordAudit({
      actor_user_id: args.agentUserId,
      module: 'communication',
      action: 'send_guesty_failed',
      target_type: 'conversation',
      target_id: c.id,
      metadata: { status: result.status, error: result.error },
    });
    // Provide a fallback URL the UI can deep-link to (composes the
    // message into the Guesty inbox compose pane via query string).
    const fallbackUrl = `https://app.guesty.com/inbox/${c.external_id}?reply=${encodeURIComponent(args.body.slice(0, 500))}`;
    return { ok: false, status: result.status, error: result.error, fallbackUrl };
  }

  // Persist to beithady_messages
  const sentAtIso = new Date().toISOString();
  const externalId = (result.post as { _id?: string; id?: string })._id
    || (result.post as { _id?: string; id?: string }).id
    || null;

  const insertRow: Record<string, unknown> = {
    channel: 'guesty',
    external_id: externalId,
    conversation_id: c.id,
    conversation_external_id: c.external_id,
    direction: 'outbound',
    guest_id: c.guest_id,
    reservation_id: c.reservation_id,
    building_code: c.building_code,
    module_type: args.module || 'whatsapp',
    module_subject: args.subject || null,
    body: args.body,
    is_automatic: false,
    from_full_name: args.agentDisplayName || null,
    from_type: 'employee',
    sent_by_user_id: args.agentUserId,
    raw: result.raw as object,
    sent_at: sentAtIso,
  };
  const { data: ins, error: insErr } = await sb
    .from('beithady_messages')
    .insert(insertRow)
    .select('id')
    .single();
  if (insErr) {
    // Message reached Guesty but local insert failed — log and continue.
    // eslint-disable-next-line no-console
    console.warn('[send-guesty] beithady_messages insert failed:', insErr.message);
  }

  // Update conversation: last_outbound_at + clear SLA bucket via recompute
  await sb
    .from('beithady_conversations')
    .update({
      last_outbound_at: sentAtIso,
      sla_age_seconds: null,
      sla_bucket: null,
      sla_breach: false,
    })
    .eq('id', c.id);

  await recordAudit({
    actor_user_id: args.agentUserId,
    module: 'communication',
    action: 'send_guesty_success',
    target_type: 'conversation',
    target_id: c.id,
    metadata: {
      external_post_id: externalId,
      body_length: args.body.length,
      module: args.module || 'whatsapp',
    },
  });

  return {
    ok: true,
    messageId: (ins as { id: string } | null)?.id || '',
    externalId,
  };
}
