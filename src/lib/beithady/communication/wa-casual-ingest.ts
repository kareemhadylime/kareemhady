import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { getCredential } from '@/lib/credentials';

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
    // Audit fix H-C7: edit/delete propagation. Green-API event names
    // are tentative (varies per instance config); we recognise the
    // common shapes. The body of an edited/deleted message either
    // appears at the top-level idMessage or in messageData.editedIdMessage
    // depending on instance version. Schema columns added in 0075.
    if (typeWebhook === 'editedMessage' || typeWebhook === 'editedMessageReceived') {
      const r = await ingestEditDelete(payload, 'edited');
      await sb.from('beithady_green_webhook_events')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('id', logId);
      return r;
    }
    if (typeWebhook === 'deletedMessage' || typeWebhook === 'deletedMessageReceived') {
      const r = await ingestEditDelete(payload, 'deleted');
      await sb.from('beithady_green_webhook_events')
        .update({ processed: true, processed_at: new Date().toISOString() })
        .eq('id', logId);
      return r;
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

  // Audit fix H-C6: detect direction. Some Green-API instances deliver
  // the operator's out-of-band reply (typed on the personal WhatsApp
  // app rather than via composer) through `incomingMessageReceived`
  // with sender == the instance's own number. Pre-fix we hardcoded
  // direction='inbound' for every event, misclassifying these as guest
  // messages and triggering AI auto-reply on our own message.
  const instanceWid = await getCredential('green', 'wid').catch(() => null);
  const isOwnNumber = instanceWid && (
    chatId === instanceWid ||
    `${phoneDigits}@c.us` === instanceWid ||
    chatId.startsWith(`${instanceWid.replace(/@.*/, '')}@`)
  );
  const detectedDirection: 'inbound' | 'outbound' = isOwnNumber ? 'outbound' : 'inbound';

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
        // Audit fix H-C6: see direction-detection block above.
        direction: detectedDirection,
        module_type: 'whatsapp',
        body,
        attachments: attachments.length ? attachments : [],
        from_full_name: senderName,
        from_type: detectedDirection === 'outbound' ? 'employee' : 'guest',
        sent_at: sentAtIso,
        raw: payload as object,
      },
      { onConflict: 'channel,external_id', ignoreDuplicates: false }
    )
    .select('id')
    .single();
  if (insErr) return { ok: false, error: `msg_insert: ${insErr.message}` };

  // Update conversation on every inbound:
  //   - bump last_inbound_at + modified_at_external
  //   - audit fix H-B4: INCREMENT unread_count (was hard-set to 1, so
  //     5 unread looked like 1 in the inbox sidebar). Read-then-write
  //     is mildly racy under burst, but acceptable — worst case is
  //     unread_count off by one for a few seconds.
  //   - audit fix C-B2: clear archived_at on inbound so an archived
  //     conversation auto-restores. UI promised this but the code never
  //     did it; DB confirmed 1 row stuck in archived-with-inbound state.
  //   - audit fix C-B3: clear resolved_at + flip state to 'open' so a
  //     resolved thread auto-reopens when the guest replies.
  //   - guest_full_name: only set on first inbound (don't overwrite a
  //     richer prior name with whatever the guest changes their WA
  //     display name to mid-conversation).
  const { data: convPrev } = await sb
    .from('beithady_conversations')
    .select('unread_count, archived_at, resolved_at, state, guest_full_name')
    .eq('id', conversationId)
    .maybeSingle();
  const prevUnread = Number((convPrev as { unread_count: number | null } | null)?.unread_count ?? 0);
  const wasArchived = !!(convPrev as { archived_at: string | null } | null)?.archived_at;
  const wasResolved = !!(convPrev as { resolved_at: string | null } | null)?.resolved_at;
  const hadName = !!(convPrev as { guest_full_name: string | null } | null)?.guest_full_name;
  const convPatch: Record<string, unknown> = {
    last_inbound_at: sentAtIso,
    modified_at_external: sentAtIso,
    unread_count: prevUnread + 1,
  };
  if (wasArchived) {
    convPatch.archived_at = null;
    convPatch.archived_reason = 'restore_undo';
  }
  if (wasResolved) {
    convPatch.resolved_at = null;
    convPatch.state = 'open';
  }
  if (!hadName && senderName) {
    convPatch.guest_full_name = senderName;
  }
  await sb.from('beithady_conversations').update(convPatch).eq('id', conversationId);

  // Recompute SLA so the inbox sidebar lights up immediately
  await sb.rpc('beithady_communication_sla_recompute');

  const newMessageId = (insMsg as { id: string } | null)?.id;

  // Phase E: kick off AI auto-reply + reorder parser asynchronously.
  //
  // Audit fix H-B7: pre-fix used bare `void (async () => {...})()` which
  // Vercel kills the moment the response is flushed. Long Claude calls
  // (~5-10s) silently dropped on production. Now wrapped in
  // `waitUntil()` so the function continues running after the response
  // returns. Falls back to bare void on local/non-Vercel environments
  // where waitUntil isn't available.
  if (newMessageId) {
    const { waitUntil } = await import('@vercel/functions').catch(() => ({
      waitUntil: (p: Promise<unknown>) => { void p; },
    }));

    // Audit fix C-C3: per-phone trust check before firing downstream
    // side-effects. The slug-only auth is fragile — if the slug ever
    // leaks (admin screenshot, error tracker, support ticket), an
    // attacker can fabricate inbound from any phone and trigger AI
    // auto-reply / reorder draft on attacker-chosen content.
    // Trust = the sender phone matches an existing beithady_guests row
    // (real guest) OR a known cleaner phone in beithady_settings.
    // Unknown senders still get their message persisted (operator can
    // see and react manually) but do NOT trigger AI / reorder.
    const isTrustedSender = await isWaCasualSenderTrusted(phoneDigits);

    if (isTrustedSender && detectedDirection === 'inbound') {
      waitUntil((async () => {
        try {
          const { processInboundForAutoReply } = await import('@/lib/beithady/ai/auto-reply');
          await processInboundForAutoReply(newMessageId);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[wa-casual-ingest] auto-reply failed:', e);
        }
      })());
    }

    // Audit fix H-E11: WA media URLs from Green-API CDN expire (~7d).
    // Mirror them into our durable beithady-wa-media bucket so older
    // messages keep rendering. Background task — webhook returns
    // immediately. Updates the message row's `attachments[i].downloadUrl`
    // in place once the mirror completes.
    if (attachments.length > 0) {
      waitUntil((async () => {
        try {
          await mirrorWaAttachmentsToStorage(newMessageId, attachments);
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[wa-casual-ingest] media mirror failed:', e);
        }
      })());
    }

    // Phase M.13: detect inbound inventory reorder requests from cleaners.
    // Heuristic gate first (no API call) → AI parse if matched → draft Issue
    // tagged created_via='wa_inbound' for manager approval.
    // Audit fix C-C3: also gate on isTrustedSender — reorder draft
    // creation is high-impact (creates inventory issue rows) so we
    // never run it for unknown senders.
    if (isTrustedSender && typeof body === 'string' && body.length > 0) {
      waitUntil((async () => {
        try {
          const { looksLikeReorder, parseReorderMessage, createReorderDraftFromWa } =
            await import('@/lib/beithady/inventory/wa-reorder-parser');
          if (!looksLikeReorder(body)) return;
          const parsed = await parseReorderMessage(body);
          if (parsed.items.length === 0) return;
          await createReorderDraftFromWa({
            parsed,
            sender_phone: phoneDigits,
            sender_name: senderName,
            conversation_id: conversationId,
            message_id: newMessageId,
            raw_body: body,
          });
        } catch (e) {
          // eslint-disable-next-line no-console
          console.warn('[wa-casual-ingest] inventory reorder parse failed:', e);
        }
      })());
    }
  }

  return {
    ok: true,
    message_id: newMessageId,
    conversation_id: conversationId,
  };
}

// Audit fix C-C3: trusted-sender check before AI auto-reply / reorder
// draft fires. Slug-only auth means a leaked URL = inbound forging
// surface; downstream side-effects must NOT trigger for unknown
// phones. Trusted = phone matches an existing beithady_guests row
// OR an existing beithady_conversations.guest_phone (we've spoken
// before) OR a known cleaner phone in the cleaner allowlist setting.
async function isWaCasualSenderTrusted(phoneDigits: string): Promise<boolean> {
  if (!phoneDigits) return false;
  const sb = supabaseAdmin();
  const e164 = '+' + phoneDigits;

  // 1) Guest already in CRM
  const { data: guest } = await sb
    .from('beithady_guests')
    .select('id')
    .eq('phone_e164', e164)
    .maybeSingle();
  if (guest) return true;

  // 2) Conversation already exists with prior outbound from us
  // (so we've already validated this phone in some earlier session)
  const { data: convWithOutbound } = await sb
    .from('beithady_conversations')
    .select('id')
    .eq('channel', 'wa_casual')
    .eq('external_id', e164)
    .not('last_outbound_at', 'is', null)
    .maybeSingle();
  if (convWithOutbound) return true;

  // 3) Cleaner phone allowlist in settings
  const { data: setting } = await sb
    .from('beithady_settings')
    .select('value')
    .eq('key', 'comm_wa_trusted_cleaner_phones')
    .maybeSingle();
  if (setting) {
    const list = (setting as { value: { phones?: string[] } }).value?.phones || [];
    if (list.includes(e164) || list.includes(phoneDigits)) return true;
  }

  return false;
}

// Audit fix H-E11: download Green-API CDN media into our durable
// beithady-wa-media Supabase bucket and rewrite the message's
// attachments[i].downloadUrl to the long-lived public URL. Green-API
// signed URLs expire after ~7 days; without mirroring, older
// messages render broken images / 404 audio.
async function mirrorWaAttachmentsToStorage(
  messageId: string,
  attachments: Array<Record<string, unknown>>,
): Promise<void> {
  const sb = supabaseAdmin();
  const SUPABASE_HOST_HINT = '/storage/v1/object/public/';
  const next: Array<Record<string, unknown>> = [];
  let mutated = false;
  for (const a of attachments) {
    const url = typeof a.downloadUrl === 'string' ? a.downloadUrl : '';
    if (!url || url.includes(SUPABASE_HOST_HINT)) {
      // No URL or already on Supabase — pass through.
      next.push(a);
      continue;
    }
    try {
      const res = await fetch(url, { redirect: 'follow' });
      if (!res.ok) { next.push(a); continue; }
      const contentType =
        (typeof a.mimeType === 'string' && a.mimeType) ||
        res.headers.get('content-type') ||
        'application/octet-stream';
      const ext =
        contentType.startsWith('image/jpeg') ? 'jpg' :
        contentType.startsWith('image/png') ? 'png' :
        contentType.startsWith('image/webp') ? 'webp' :
        contentType.startsWith('video/mp4') ? 'mp4' :
        contentType.startsWith('video/') ? 'webm' :
        contentType.startsWith('audio/ogg') ? 'ogg' :
        contentType.startsWith('audio/mpeg') ? 'mp3' :
        contentType.startsWith('audio/') ? 'm4a' :
        contentType === 'application/pdf' ? 'pdf' :
        'bin';
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const id = Math.random().toString(36).slice(2, 10);
      const path = `wa-casual/inbound/${ts}-${id}.${ext}`;
      const buf = Buffer.from(await res.arrayBuffer());
      const { error: upErr } = await sb.storage
        .from('beithady-wa-media')
        .upload(path, buf, { contentType, upsert: false });
      if (upErr) { next.push(a); continue; }
      const { data: pub } = sb.storage.from('beithady-wa-media').getPublicUrl(path);
      next.push({ ...a, downloadUrl: pub.publicUrl, originalDownloadUrl: url });
      mutated = true;
    } catch {
      next.push(a);
    }
  }
  if (mutated) {
    await sb
      .from('beithady_messages')
      .update({ attachments: next })
      .eq('id', messageId);
  }
}

// Audit fix H-C7: edit/delete propagation. Looks up the prior
// beithady_messages row by external_id (the original idMessage), then
// either marks deleted_at + clears body or appends to edit_history +
// updates body. Best-effort across known Green-API event shapes;
// unrecognised shapes log + skip without throwing.
async function ingestEditDelete(
  payload: AnyJson,
  kind: 'edited' | 'deleted',
): Promise<IngestResult> {
  const sb = supabaseAdmin();
  const idMessage =
    asString(get(payload, 'editedIdMessage')) ||
    asString(get(payload, 'messageData', 'editedIdMessage')) ||
    asString(get(payload, 'deletedIdMessage')) ||
    asString(get(payload, 'idMessage'));
  if (!idMessage) return { ok: true, skipped: 'no_id_message' };

  if (kind === 'deleted') {
    await sb
      .from('beithady_messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('channel', 'wa_casual')
      .eq('external_id', idMessage);
    return { ok: true };
  }

  // edited — pull current body, append to history, update body
  const newBody =
    asString(get(payload, 'messageData', 'textMessageData', 'textMessage')) ||
    asString(get(payload, 'messageData', 'extendedTextMessageData', 'text'));
  if (!newBody) return { ok: true, skipped: 'no_new_body' };

  const { data: prevRow } = await sb
    .from('beithady_messages')
    .select('id, body, edit_history')
    .eq('channel', 'wa_casual')
    .eq('external_id', idMessage)
    .maybeSingle();
  if (!prevRow) return { ok: true, skipped: 'message_not_found' };
  const prev = prevRow as { id: string; body: string | null; edit_history: unknown };
  const history = Array.isArray(prev.edit_history) ? prev.edit_history : [];
  history.push({ at: new Date().toISOString(), prev_body: prev.body });
  await sb
    .from('beithady_messages')
    .update({
      body: newBody,
      edited_at: new Date().toISOString(),
      edit_history: history,
    })
    .eq('id', prev.id);
  return { ok: true };
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
