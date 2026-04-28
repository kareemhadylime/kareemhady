import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWhatsApp, sendWhatsAppFile } from '@/lib/whatsapp/green-api';
import { recordAudit } from '@/lib/beithady/audit';
import { isOutboundPaused } from '@/lib/beithady/settings';

// Server-side wrapper for sending a message into a wa_casual conversation
// via Green-API. Persists to beithady_messages, updates conversation,
// audits.

export type SendWaCasualArgs = {
  beithadyConversationId: string;
  body: string;
  fileUrl?: string;
  fileName?: string;
  fileMime?: string;
  agentUserId: string | null;
  agentDisplayName?: string | null;
};

export type SendWaCasualResult =
  | { ok: true; messageId: string; providerMessageId: string }
  | { ok: false; status: number; error: string };

export async function sendWaCasualMessage(args: SendWaCasualArgs): Promise<SendWaCasualResult> {
  // Global emergency kill switch. Refuse the send before touching the
  // provider so a single beithady_settings flip stops every sender path.
  if (await isOutboundPaused()) {
    await recordAudit({
      actor_user_id: args.agentUserId,
      module: 'communication',
      action: 'send_wa_casual_blocked_killswitch',
      target_type: 'conversation',
      target_id: args.beithadyConversationId,
      metadata: { reason: 'beithady_outbound_paused=true', body_length: args.body.length },
    });
    return { ok: false, status: 503, error: 'outbound_paused' };
  }
  const sb = supabaseAdmin();
  const { data: conv } = await sb
    .from('beithady_conversations')
    .select('id, channel, external_id, guest_id, building_code')
    .eq('id', args.beithadyConversationId)
    .maybeSingle();
  if (!conv) return { ok: false, status: 404, error: 'conversation_not_found' };
  const c = conv as {
    id: string;
    channel: string;
    external_id: string;
    guest_id: string | null;
    building_code: string | null;
  };
  if (c.channel !== 'wa_casual') return { ok: false, status: 400, error: 'wrong_channel' };

  const phone = c.external_id.replace(/[^0-9]/g, '');

  let providerResult;
  if (args.fileUrl) {
    providerResult = await sendWhatsAppFile({
      to: phone,
      fileUrl: args.fileUrl,
      fileName: args.fileName || 'file',
      caption: args.body,
    });
  } else {
    providerResult = await sendWhatsApp({ to: phone, message: args.body });
  }

  if (!providerResult.ok) {
    await recordAudit({
      actor_user_id: args.agentUserId,
      module: 'communication',
      action: 'send_wa_casual_failed',
      target_type: 'conversation',
      target_id: c.id,
      metadata: { error: providerResult.error, has_file: !!args.fileUrl },
    });
    const status = providerResult.disabled ? 503 : 502;
    return { ok: false, status, error: providerResult.error };
  }

  const sentAtIso = new Date().toISOString();
  const attachments: Array<Record<string, unknown>> = [];
  if (args.fileUrl) {
    attachments.push({
      type: args.fileMime?.startsWith('audio/') ? 'voice' : args.fileMime?.startsWith('image/') ? 'image' : 'file',
      downloadUrl: args.fileUrl,
      fileName: args.fileName,
      mimeType: args.fileMime,
    });
  }
  const { data: ins } = await sb
    .from('beithady_messages')
    .insert({
      channel: 'wa_casual',
      external_id: providerResult.providerMessageId,
      conversation_id: c.id,
      conversation_external_id: c.external_id,
      direction: 'outbound',
      guest_id: c.guest_id,
      building_code: c.building_code,
      module_type: 'whatsapp',
      body: args.body,
      attachments,
      is_automatic: false,
      from_full_name: args.agentDisplayName || null,
      from_type: 'employee',
      sent_by_user_id: args.agentUserId,
      delivery_status: 'sent',
      raw: { providerMessageId: providerResult.providerMessageId, fileUrl: args.fileUrl, fileName: args.fileName },
      sent_at: sentAtIso,
    })
    .select('id')
    .single();

  await sb
    .from('beithady_conversations')
    .update({
      last_outbound_at: sentAtIso,
      sla_age_seconds: null,
      sla_bucket: null,
      sla_breach: false,
      unread_count: 0,
    })
    .eq('id', c.id);

  await recordAudit({
    actor_user_id: args.agentUserId,
    module: 'communication',
    action: 'send_wa_casual_success',
    target_type: 'conversation',
    target_id: c.id,
    metadata: {
      provider_message_id: providerResult.providerMessageId,
      body_length: args.body.length,
      has_file: !!args.fileUrl,
    },
  });

  return {
    ok: true,
    messageId: (ins as { id: string } | null)?.id || '',
    providerMessageId: providerResult.providerMessageId,
  };
}

// Upload a browser-recorded blob (from MediaRecorder) into the
// beithady-wa-media Supabase Storage bucket and return a public URL.
// Used by the voice recorder + file attach flows.
export async function uploadWaMedia(
  fileBytes: ArrayBuffer,
  mime: string,
  ext: string
): Promise<{ ok: true; url: string; path: string } | { ok: false; error: string }> {
  const sb = supabaseAdmin();
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const id = Math.random().toString(36).slice(2, 10);
  const path = `wa-casual/${ts}-${id}.${ext}`;
  const { error } = await sb.storage
    .from('beithady-wa-media')
    .upload(path, new Uint8Array(fileBytes), { contentType: mime, upsert: false });
  if (error) return { ok: false, error: error.message };
  const { data } = sb.storage.from('beithady-wa-media').getPublicUrl(path);
  return { ok: true, url: data.publicUrl, path };
}
