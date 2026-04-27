import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

// Green-API webhook event → beithady tables. Idempotent on the
// (green_event_id) unique index in beithady_green_webhook_events.

// Green-API event shapes vary slightly by version; we support the
// `incomingMessageReceived` + `outgoingMessageStatus` + `outgoingAPI`
// + `outgoingMessage` flavors and ignore everything else (state pings,
// quota events, etc).

type AnyJson = Record<string, unknown>;

function digitsOnlyFromChatId(chatId: string | undefined): string {
  if (!chatId) return '';
  // Green-API format: '<digits>@c.us' for 1-1, '<digits>@g.us' for groups
  const match = String(chatId).match(/^(\d+)/);
  return match ? match[1] : '';
}

function get(o: AnyJson | undefined, ...path: string[]): unknown {
  let cur: unknown = o;
  for (const k of path) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as AnyJson)[k];
  }
  return cur;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asNumberMillis(v: unknown): string | null {
  // Green-API sends Unix epoch SECONDS as `timestamp`. Convert to ISO.
  if (typeof v === 'number') return new Date(v * 1000).toISOString();
  if (typeof v === 'string' && /^\d+$/.test(v)) return new Date(parseInt(v, 10) * 1000).toISOString();
  return null;
}

export type IngestResult = {
  ok: boolean;
  message_id?: string;
  conversation_id?: string;
  skipped?: string;
  error?: string;
};

export async function ingestGreenWebhookEvent(payload: AnyJson): Promise<IngestResult> {
  const sb = supabaseAdmin();

  const typeWebhook = asString(payload.typeWebhook) || 'unknown';
  const greenEventId =
    asString(get(payload, 'idMessage')) ||
    asString(get(payload, 'messageData', 'idMessage')) ||
    null;

  // Log raw event up front. If green_event_id collides we skip (dedupe).
  const { data: logIns, error: logErr } = await sb
    .from('beithady_green_webhook_events')
    .insert({
      green_event_id: greenEventId,
      type_webhook: typeWebhook,
      raw: payload as object,
    })
    .select('id')
    .single();
  if (logErr) {
    // Unique violation = duplicate event = idempotent no-op.
    if (logErr.code === '23505') {
      return { ok: true, skipped: 'duplicate_event' };
    }
    return { ok: false, error: `log_insert: ${logErr.message}` };
  }
  const logId = (logIns as { id: string }).id;

  try {
    if (typeWebhook === 'incomingMessageReceived') {
      const result = await ingestIncoming(payload);
      await sb
        .from('beithady_green_webhook_events')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          message_id: result.message_id || null,
          conversation_id: result.conversation_id || null,
        })
        .eq('id', logId);
      return result;
    }
    if (
      typeWebhook === 'outgoingMessageStatus' ||
      typeWebhook === 'outgoingAPIMessageStatus'
    ) {
      const result = await ingestOutgoingStatus(payload);
      await sb
        .from('beithady_green_webhook_events')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
        })
        .eq('id', logId);
      return result;
    }
    if (typeWebhook === 'outgoingMessageReceived' || typeWebhook === 'outgoingAPIMessageReceived') {
      // Echo of an outbound we already inserted via send-wa-casual.ts —
      // mark log processed without duplicating the message.
      await sb
        .from('beithady_green_webhook_events')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('id', logId);
      return { ok: true, skipped: 'outbound_echo' };
    }
    // State, quota, etc. — log only.
    await sb
      .from('beithady_green_webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('id', logId);
    return { ok: true, skipped: `ignored_type_${typeWebhook}` };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb
      .from('beithady_green_webhook_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        error: msg,
      })
      .eq('id', logId);
    return { ok: false, error: msg };
  }
}

async function ingestIncoming(payload: AnyJson): Promise<IngestResult> {
  const sb = supabaseAdmin();

  const senderData = (get(payload, 'senderData') || {}) as AnyJson;
  const messageData = (get(payload, 'messageData') || {}) as AnyJson;
  const chatId = asString(senderData.chatId) || asString(senderData.sender);
  const senderName = asString(senderData.senderName) || asString(senderData.chatName);
  if (!chatId) return { ok: false, error: 'no_chat_id' };

  const phoneDigits = digitsOnlyFromChatId(chatId);
  if (!phoneDigits) return { ok: false, error: 'invalid_chat_id' };
  // Skip group chats for Phase C.3 — they need different handling.
  if (chatId.endsWith('@g.us')) return { ok: true, skipped: 'group_chat_unsupported' };

  // Ensure conversation exists
  const { data: convData, error: convErr } = await sb.rpc(
    'beithady_ensure_wa_casual_conversation',
    { p_phone_digits: phoneDigits, p_guest_name: senderName }
  );
  if (convErr) return { ok: false, error: `ensure_conv: ${convErr.message}` };
  const conversationId = convData as string;

  // Determine body + module type from messageData
  const typeMessage = asString(messageData.typeMessage) || 'textMessage';
  let body: string | null = null;
  const attachments: Array<Record<string, unknown>> = [];

  switch (typeMessage) {
    case 'textMessage':
    case 'extendedTextMessage':
      body =
        asString(get(messageData, 'textMessageData', 'textMessage')) ||
        asString(get(messageData, 'extendedTextMessageData', 'text')) ||
        null;
      break;
    case 'imageMessage':
    case 'documentMessage':
    case 'videoMessage':
    case 'audioMessage':
    case 'voiceMessage': {
      const fileData = (get(messageData, 'fileMessageData') || {}) as AnyJson;
      body = asString(fileData.caption) || `[${typeMessage.replace('Message', '')}]`;
      attachments.push({
        type: typeMessage.replace('Message', ''),
        downloadUrl: asString(fileData.downloadUrl),
        fileName: asString(fileData.fileName),
        mimeType: asString(fileData.mimeType),
      });
      break;
    }
    case 'locationMessage': {
      const loc = (get(messageData, 'locationMessageData') || {}) as AnyJson;
      body = `📍 Location: ${asString(loc.nameLocation) || ''} ${asString(loc.address) || ''}`.trim();
      attachments.push({
        type: 'location',
        latitude: loc.latitude,
        longitude: loc.longitude,
      });
      break;
    }
    case 'contactMessage': {
      const c = (get(messageData, 'contactMessageData') || {}) as AnyJson;
      body = `👤 Contact: ${asString(c.displayName) || asString(c.vcard) || 'shared'}`;
      break;
    }
    default:
      body = `[unsupported: ${typeMessage}]`;
  }

  const sentAtIso =
    asNumberMillis(payload.timestamp) ||
    asNumberMillis(messageData.timestamp) ||
    new Date().toISOString();
  const externalId =
    asString(payload.idMessage) ||
    asString(messageData.idMessage) ||
    null;

  const { data: insMsg, error: insErr } = await sb
    .from('beithady_messages')
    .upsert(
      {
        channel: 'wa_casual',
        external_id: externalId,
        conversation_id: conversationId,
        conversation_external_id: '+' + phoneDigits,
        direction: 'inbound',
        module_type: 'whatsapp',
        body,
        attachments: attachments.length ? attachments : [],
        from_full_name: senderName,
        from_type: 'guest',
        sent_at: sentAtIso,
        raw: payload as object,
      },
      { onConflict: 'channel,external_id', ignoreDuplicates: false }
    )
    .select('id')
    .single();
  if (insErr) return { ok: false, error: `msg_insert: ${insErr.message}` };

  // Update conversation: bump last_inbound_at + unread_count
  await sb
    .from('beithady_conversations')
    .update({
      last_inbound_at: sentAtIso,
      modified_at_external: sentAtIso,
      unread_count: 1, // simple — could increment instead but Phase E owns read-state refinement
      guest_full_name: senderName ?? undefined,
    })
    .eq('id', conversationId);

  // Recompute SLA so the inbox sidebar lights up immediately
  await sb.rpc('beithady_communication_sla_recompute');

  const newMessageId = (insMsg as { id: string } | null)?.id;

  // Phase E: kick off AI auto-reply asynchronously. We don't await
  // because Green-API webhooks have a tight timeout — fire-and-forget,
  // log errors. The classification + decision land back in the
  // beithady_ai_reply_log table within ~2s.
  if (newMessageId) {
    void (async () => {
      try {
        const { processInboundForAutoReply } = await import('@/lib/beithady/ai/auto-reply');
        await processInboundForAutoReply(newMessageId);
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[wa-casual-ingest] auto-reply failed:', e);
      }
    })();
  }

  return {
    ok: true,
    message_id: newMessageId,
    conversation_id: conversationId,
  };
}

async function ingestOutgoingStatus(payload: AnyJson): Promise<IngestResult> {
  const sb = supabaseAdmin();
  const idMessage = asString(payload.idMessage);
  if (!idMessage) return { ok: true, skipped: 'no_id_message' };
  const status = asString(payload.status) || 'unknown'; // 'sent' | 'delivered' | 'read' | 'failed' | ...
  await sb
    .from('beithady_messages')
    .update({ delivery_status: status })
    .eq('channel', 'wa_casual')
    .eq('external_id', idMessage);
  return { ok: true };
}
