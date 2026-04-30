import 'server-only';
import { supabaseAdmin } from './supabase';
import { getGuestyConversation } from './guesty';
import { normalizeConversationRow } from './run-guesty-sync';

// Phase C.5 follow-up — orphaned-conversation recovery.
//
// Background: Guesty's webhook subscription on this Beithady account
// fires `reservation.messageReceived` / `reservation.messageSent` events
// but does NOT fire `conversation.created`. When a brand-new
// conversation arrives, our webhook handler upserts the post into
// guesty_conversation_posts, then tries to UPDATE the parent row in
// guesty_conversations — silently failing because the row doesn't
// exist. Result: orphaned posts that the SQL ingest proc skips.
//
// This module fetches missing parents from Guesty Open API and upserts
// them. Two entry points:
//   - fetchAndUpsertConversation(id)  — single id, used by the webhook
//     handler's lazy-create path to prevent NEW orphans
//   - recoverOrphanedConversations() — batch scan, used by the every-
//     5-min comm-sync cron to recover EXISTING orphans

export type RecoverOneResult =
  | { ok: true; conversationId: string; alreadyExisted: boolean }
  | { ok: false; conversationId: string; reason: 'not_found' | 'fetch_error' | 'db_error'; error?: string };

export async function fetchAndUpsertConversation(
  conversationId: string,
): Promise<RecoverOneResult> {
  if (!conversationId) {
    return { ok: false, conversationId: '', reason: 'fetch_error', error: 'missing_conversation_id' };
  }
  const sb = supabaseAdmin();

  // Skip the API round-trip if the row already exists. Cheap fast-path
  // when this helper is called from the webhook on every inbound — most
  // calls hit existing conversations and return immediately.
  const { data: existing } = await sb
    .from('guesty_conversations')
    .select('id')
    .eq('id', conversationId)
    .maybeSingle();
  if (existing) {
    return { ok: true, conversationId, alreadyExisted: true };
  }

  const conv = await getGuestyConversation(conversationId);
  if (!conv) {
    return { ok: false, conversationId, reason: 'not_found' };
  }

  const row = normalizeConversationRow(conv);
  const { error } = await sb
    .from('guesty_conversations')
    .upsert(row, { onConflict: 'id' });
  if (error) {
    return { ok: false, conversationId, reason: 'db_error', error: error.message };
  }
  return { ok: true, conversationId, alreadyExisted: false };
}

export type BatchRecoveryResult = {
  scanned: number;
  recovered: number;
  notFound: number;
  failed: number;
  errors: Array<{ conversationId: string; reason: string; error?: string }>;
};

// Scans for orphaned posts (post.conversation_id with no matching row
// in guesty_conversations) and recovers up to maxToFetch parents.
// Conservative defaults: 50 fetches per run, sequential with a 200ms
// throttle to keep Guesty API rate-limit headroom. The cron runs every
// 5 minutes so recovery completes quickly even with hundreds of orphans.
export async function recoverOrphanedConversations(
  maxToFetch: number = 50,
  throttleMs: number = 200,
): Promise<BatchRecoveryResult> {
  const sb = supabaseAdmin();
  const out: BatchRecoveryResult = {
    scanned: 0,
    recovered: 0,
    notFound: 0,
    failed: 0,
    errors: [],
  };

  const { data: orphans, error } = await sb.rpc('beithady_orphan_conv_ids', {
    p_limit: maxToFetch,
  });
  if (error) {
    out.errors.push({ conversationId: '', reason: 'rpc_error', error: error.message });
    return out;
  }
  const rows = (orphans as Array<{ conversation_id: string }> | null) || [];
  out.scanned = rows.length;
  for (let i = 0; i < rows.length; i++) {
    const cid = rows[i].conversation_id;
    const r = await fetchAndUpsertConversation(cid);
    if (r.ok) {
      out.recovered += 1;
    } else if (r.reason === 'not_found') {
      out.notFound += 1;
      out.errors.push({ conversationId: cid, reason: r.reason });
    } else {
      out.failed += 1;
      out.errors.push({ conversationId: cid, reason: r.reason, error: r.error });
    }
    if (throttleMs > 0 && i < rows.length - 1) {
      await new Promise(res => setTimeout(res, throttleMs));
    }
  }
  return out;
}
