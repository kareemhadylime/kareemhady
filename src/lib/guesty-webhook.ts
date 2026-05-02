import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

// Phase O — Guesty webhook handler. Ingests real-time events into the
// existing guesty_conversations + guesty_conversation_posts tables, then
// triggers the existing beithady_communication_ingest RPC to propagate
// to beithady_messages so the Unified Inbox sees the change within ~2s.
//
// Reference event names (from open-api-docs.guesty.com/docs/webhooks-messages):
//   - reservation.messageReceived  (inbound from guest)
//   - reservation.messageSent      (outbound from host/agent)
//   - conversation.created
//   - conversation.updated
//   - reservation.created / .updated / .canceled (lower priority for inbox)
//
// Payload top-level shape (per docs):
//   { event, reservationId, conversation: {...meta, thread:[...]}, message: {...} }

type AnyJson = Record<string, unknown> | unknown[] | string | number | boolean | null;

export type WebhookProcessResult =
  | { ok: true; status: 'processed' | 'duplicate' | 'ignored'; event_name: string; row_id?: string }
  | { ok: false; status: 'error' | 'unauthorized'; event_name: string; error: string };

function get(o: AnyJson | undefined, ...path: string[]): unknown {
  let cur: unknown = o;
  for (const k of path) {
    if (cur && typeof cur === 'object' && !Array.isArray(cur)) {
      cur = (cur as Record<string, unknown>)[k];
    } else return undefined;
  }
  return cur;
}

function asString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

function asIso(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === 'string') {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  if (typeof v === 'number') {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

// Compute an idempotency key per event type. Same key arrives → row 2 collides
// with the UNIQUE index → we treat as 'duplicate' and return ok.
function deriveUniqueKey(eventName: string, payload: AnyJson): string | null {
  // Guesty's actual webhook payload puts the message id in `message.postId`
  // (the conversation-post _id). `meta.messageId` is a separate event-level
  // UUID (one per webhook delivery) — useful as a fallback dedupe key when
  // postId is somehow missing.
  const messageId = asString(get(payload, 'message', 'postId'))
    || asString(get(payload, 'message', '_id'))
    || asString(get(payload, 'message', 'id'))
    || asString(get(payload, 'meta', 'messageId'));
  const reservationId = asString(get(payload, 'reservationId'))
    || asString(get(payload, 'reservation', '_id'))
    || asString(get(payload, 'reservation', 'id'));
  const conversationId = asString(get(payload, 'conversation', '_id'))
    || asString(get(payload, 'conversation', 'id'));
  const createdAt = asString(get(payload, 'message', 'createdAt'))
    || asString(get(payload, 'createdAt'));

  if (eventName.includes('message')) {
    if (messageId) return `${eventName}:${messageId}`;
    if (reservationId && createdAt) return `${eventName}:${reservationId}:${createdAt}`;
  }
  if (eventName.startsWith('conversation.')) {
    if (conversationId) return `${eventName}:${conversationId}:${createdAt || Date.now()}`;
  }
  if (eventName.startsWith('reservation.')) {
    if (reservationId) return `${eventName}:${reservationId}:${createdAt || Date.now()}`;
  }
  return null;
}

export type IncomingHeaders = {
  userAgent?: string | null;
  sourceIp?: string | null;
  contentType?: string | null;
};

export async function processGuestyWebhook(
  payload: AnyJson,
  headers: IncomingHeaders = {},
): Promise<WebhookProcessResult> {
  const eventName = asString(get(payload, 'event')) || 'unknown';
  const sb = supabaseAdmin();

  const reservationId = asString(get(payload, 'reservationId'))
    || asString(get(payload, 'reservation', '_id'))
    || asString(get(payload, 'reservation', 'id'));
  const conversationId = asString(get(payload, 'conversation', '_id'))
    || asString(get(payload, 'conversation', 'id'));
  // Guesty puts the conversation-post id under `message.postId` (verified
  // via inspection of 138 actual payloads in guesty_webhook_events).
  const messageId = asString(get(payload, 'message', 'postId'))
    || asString(get(payload, 'message', '_id'))
    || asString(get(payload, 'message', 'id'))
    || asString(get(payload, 'meta', 'messageId'));

  const uniqueKey = deriveUniqueKey(eventName, payload);

  // 1. Persist the raw event first (idempotency guard via UNIQUE index)
  const { data: insertedRow, error: insertErr } = await sb
    .from('guesty_webhook_events')
    .insert({
      event_name: eventName,
      unique_key: uniqueKey,
      payload: payload as object,
      http_headers: {
        user_agent: headers.userAgent || null,
        content_type: headers.contentType || null,
      },
      source_ip: headers.sourceIp || null,
      reservation_id: reservationId,
      conversation_id: conversationId,
      message_id: messageId,
      status: 'received',
    })
    .select('id')
    .single();

  // Duplicate? Idempotent OK.
  if (insertErr) {
    if (insertErr.message?.includes('duplicate') || insertErr.message?.includes('unique')) {
      return { ok: true, status: 'duplicate', event_name: eventName };
    }
    return { ok: false, status: 'error', event_name: eventName, error: insertErr.message };
  }
  const rowId = (insertedRow as { id: string }).id;

  // 2. Route by event type. Anything we don't handle gets marked 'ignored'.
  try {
    if (eventName === 'reservation.messageReceived' || eventName === 'reservation.messageSent') {
      await ingestMessage(payload, eventName === 'reservation.messageReceived' ? 'guest' : 'host');
    } else if (eventName.startsWith('conversation.')) {
      await ingestConversation(payload);
    } else if (eventName.startsWith('reservation.')) {
      // Reservation events: light touch — just log; the daily Guesty pull
      // handles the heavy reservation merge (avoids touching listings table).
      // Future: dedicated handler that updates only modified reservation fields.
      await sb.from('guesty_webhook_events').update({
        status: 'ignored',
        processed_at: new Date().toISOString(),
        error: 'reservation.* events deferred to daily pull (not blocking inbox)',
      }).eq('id', rowId);
      return { ok: true, status: 'ignored', event_name: eventName, row_id: rowId };
    } else {
      await sb.from('guesty_webhook_events').update({
        status: 'ignored',
        processed_at: new Date().toISOString(),
        error: 'unrecognised event type',
      }).eq('id', rowId);
      return { ok: true, status: 'ignored', event_name: eventName, row_id: rowId };
    }

    // 3. Trigger Beit Hady downstream propagation (idempotent SQL proc)
    await sb.rpc('beithady_communication_ingest');

    await sb.from('guesty_webhook_events').update({
      status: 'processed',
      processed_at: new Date().toISOString(),
    }).eq('id', rowId);

    return { ok: true, status: 'processed', event_name: eventName, row_id: rowId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb.from('guesty_webhook_events').update({
      status: 'error',
      error: msg,
      processed_at: new Date().toISOString(),
    }).eq('id', rowId);
    return { ok: false, status: 'error', event_name: eventName, error: msg };
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

async function ingestMessage(payload: AnyJson, fromType: 'guest' | 'host'): Promise<void> {
  const sb = supabaseAdmin();

  const message = get(payload, 'message') as AnyJson | undefined;
  if (!message || typeof message !== 'object') {
    throw new Error('payload.message missing or not an object');
  }

  const reservationId = asString(get(payload, 'reservationId'))
    || asString(get(payload, 'reservation', '_id'))
    || asString(get(payload, 'reservation', 'id'));
  const conversationId = asString(get(payload, 'conversation', '_id'))
    || asString(get(payload, 'conversation', 'id'));

  if (!conversationId) {
    throw new Error('conversation_id missing from message payload');
  }

  // Phase C.5 follow-up — lazy-create the parent conversation if it's
  // missing. Guesty's webhook subscription on this account fires
  // reservation.messageReceived without a preceding conversation.created,
  // so the very first message on a brand-new conversation would orphan
  // here without this fetch. Fast-path: when the row already exists,
  // fetchAndUpsertConversation skips the API round-trip.
  try {
    const { fetchAndUpsertConversation } = await import('./guesty-conversation-recovery');
    const r = await fetchAndUpsertConversation(conversationId);
    if (!r.ok) {
      // Non-fatal: log and continue with the post upsert. Worst case the
      // post is briefly orphaned and the next 5-min cron's batch
      // recovery picks it up.
      // eslint-disable-next-line no-console
      console.warn(`[guesty-webhook] lazy-create parent conv ${conversationId} failed: ${r.reason}${r.error ? ` (${r.error})` : ''}`);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.warn(`[guesty-webhook] lazy-create threw for conv ${conversationId}: ${msg}`);
  }

  // Guesty's webhook payload keys: `message.postId` is the conversation-post _id.
  // Fall back to legacy paths just in case Guesty changes the schema later.
  const messageId = asString(get(message, 'postId'))
    || asString(get(message, '_id'))
    || asString(get(message, 'id'))
    || asString(get(payload, 'meta', 'messageId'));
  if (!messageId) {
    throw new Error('message _id missing (no postId, _id, id, or meta.messageId)');
  }

  const accountId = asString(get(message, 'accountId'))
    || asString(get(payload, 'accountId'))
    || asString(get(payload, 'conversation', 'accountId'));
  const sentBy = asString(get(message, 'from', 'userId')) || asString(get(message, 'sentBy'));
  // Guesty doesn't include `from.fullName` on inbound message posts. For
  // guest messages we synthesise from conversation.meta.guestName; for host
  // messages we leave null and let the daily backfill enrich.
  const fromFullName = asString(get(message, 'from', 'fullName'))
    || asString(get(message, 'fromFullName'))
    || (fromType === 'guest'
      ? asString(get(payload, 'conversation', 'meta', 'guestName'))
      : null);
  const isAutomatic = Boolean(get(message, 'isAutomatic'));
  // Module priority order on Guesty payload: `message.module` is the actual
  // channel (`bookingCom`/`whatsapp`/`email`/`airbnb2`/`sms`). `message.type`
  // is direction (`fromGuest`/`fromHost`) and must NOT be used as module.
  const moduleType = asString(get(message, 'module')) || 'whatsapp';
  const moduleSubject = asString(get(message, 'moduleSubject')) || asString(get(message, 'subject'));
  const bodyText = asString(get(message, 'body')) || asString(get(message, 'text')) || '';
  const createdAt = asIso(get(message, 'createdAt')) || new Date().toISOString();

  // Upsert into guesty_conversation_posts
  const { error: postErr } = await sb
    .from('guesty_conversation_posts')
    .upsert({
      id: messageId,
      conversation_id: conversationId,
      account_id: accountId,
      reservation_id: reservationId,
      sent_by: sentBy,
      from_type: fromType,
      from_full_name: fromFullName,
      is_automatic: isAutomatic,
      module_type: moduleType,
      module_subject: moduleSubject,
      body_text: bodyText,
      created_at_guesty: createdAt,
      raw: payload as object,
      synced_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  if (postErr) throw new Error(`post upsert: ${postErr.message}`);

  // Bump the conversation's last-message timestamps.
  //
  // FIXED 2026-04-30: previously these columns were SWAPPED. Guesty's
  // terminology (matching the /conversations response shape that
  // run-guesty-sync.ts reads from):
  //   `lastMessageFrom.user`    = last message FROM a Guesty platform
  //                               user (host/staff with a Guesty login)
  //   `lastMessageFrom.nonUser` = last message FROM anyone else
  //                               (guest, automation, log, etc.)
  // Therefore: when a GUEST sends a post (fromType==='guest'), we must
  // bump `last_message_nonuser_at` (NOT `last_message_user_at`).
  // When a HOST replies, we bump `last_message_user_at`.
  //
  // The swap caused beithady_conversations.last_inbound_at to track
  // host-reply times and last_outbound_at to track guest-message times,
  // which made the SLA pill flag conversations as "guest waiting" right
  // after we replied, and "replied" while the guest was actually waiting.
  // Audit fix H-B5: out-of-order webhook race protection. Pre-fix two
  // concurrent webhooks for the same conversation could clobber each
  // other when the older arrived second — the OLDER createdAt
  // overwrote the NEWER timestamp on the same column. Guard the
  // update with a per-column WHERE so older bumps lose the race.
  const updates: Record<string, unknown> = {
    posts_synced_at: new Date().toISOString(),
  };
  if (fromType === 'guest') {
    updates.last_message_nonuser_at = createdAt;
    updates.latest_guest_post_at = createdAt;
    updates.latest_guest_post_text = bodyText.slice(0, 500);
    await sb
      .from('guesty_conversations')
      .update(updates)
      .eq('id', conversationId)
      .or(`last_message_nonuser_at.is.null,last_message_nonuser_at.lt.${createdAt}`);
  } else {
    updates.last_message_user_at = createdAt;
    await sb
      .from('guesty_conversations')
      .update(updates)
      .eq('id', conversationId)
      .or(`last_message_user_at.is.null,last_message_user_at.lt.${createdAt}`);
  }
}

// ---------------------------------------------------------------------------
// Conversation handler (created/updated)
// ---------------------------------------------------------------------------

async function ingestConversation(payload: AnyJson): Promise<void> {
  const sb = supabaseAdmin();
  const conv = get(payload, 'conversation') as AnyJson | undefined;
  if (!conv || typeof conv !== 'object') {
    throw new Error('payload.conversation missing or not an object');
  }
  const id = asString(get(conv, '_id')) || asString(get(conv, 'id'));
  if (!id) throw new Error('conversation._id missing');

  const row = {
    id,
    account_id: asString(get(conv, 'accountId')),
    priority: asString(get(conv, 'meta', 'priority')) || asString(get(conv, 'priority')),
    state_status: asString(get(conv, 'state', 'status')) || asString(get(conv, 'status')),
    state_read: Boolean(get(conv, 'state', 'read')),
    assignee_id: asString(get(conv, 'assigneeId')),
    last_message_user_at: asIso(get(conv, 'lastMessageUserAt')),
    last_message_nonuser_at: asIso(get(conv, 'lastMessageNonUserAt')),
    guest_id: asString(get(conv, 'guestId')) || asString(get(conv, 'guest', '_id')),
    guest_full_name: asString(get(conv, 'guest', 'fullName')),
    guest_email: asString(get(conv, 'guest', 'emails', '0')),
    guest_phone: asString(get(conv, 'guest', 'phones', '0')),
    reservation_id: asString(get(conv, 'reservationId')) || asString(get(conv, 'reservation', '_id')),
    reservation_status: asString(get(conv, 'reservation', 'status')),
    reservation_confirmation_code: asString(get(conv, 'reservation', 'confirmationCode')),
    reservation_check_in: asIso(get(conv, 'reservation', 'checkIn')),
    reservation_check_out: asIso(get(conv, 'reservation', 'checkOut')),
    listing_id: asString(get(conv, 'listingId')) || asString(get(conv, 'listing', '_id')),
    listing_nickname: asString(get(conv, 'listing', 'nickname')),
    listing_title: asString(get(conv, 'listing', 'title')),
    raw: payload as object,
    synced_at: new Date().toISOString(),
    modified_at_guesty: asIso(get(conv, 'updatedAt')) || asIso(get(conv, 'modifiedAt')) || new Date().toISOString(),
  };

  // Drop nulls so we don't overwrite richer fields populated by daily pull
  const filtered = Object.fromEntries(
    Object.entries(row).filter(([, v]) => v !== null && v !== undefined),
  );

  const { error } = await sb
    .from('guesty_conversations')
    .upsert(filtered, { onConflict: 'id' });
  if (error) throw new Error(`conversation upsert: ${error.message}`);
}
