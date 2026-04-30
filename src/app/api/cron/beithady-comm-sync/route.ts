import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';
import { recoverOrphanedConversations } from '@/lib/guesty-conversation-recovery';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Communication ingest cron — runs every 5 minutes via Vercel cron
// (vercel.json) and on-demand via ?force=1.
//
// Order:
//   1. Orphan recovery — Phase C.5 follow-up. Scans guesty_conversation_posts
//      for posts whose parent conversation isn't in guesty_conversations
//      (Guesty webhooks miss conversation.created events) and fetches the
//      missing parents from Guesty Open API. Capped at 50 fetches/run with
//      200ms throttle.
//   2. SQL ingest proc — mirrors guesty_conversations + guesty_conversation_posts
//      into beithady_conversations + beithady_messages. Idempotent via
//      ON CONFLICT DO UPDATE.

function checkAuth(req: NextRequest): { ok: true } | { ok: false; reason: string } {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return { ok: true }; // local dev / not configured
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return { ok: true };
  // Vercel cron sends the secret as the request body or via the
  // x-vercel-cron header — accept those too.
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) {
    return { ok: true };
  }
  return { ok: false, reason: 'missing_or_invalid_bearer' };
}

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });

  const sb = supabaseAdmin();
  try {
    // Step 1 — orphan recovery. Best-effort: don't fail the whole cron
    // if Guesty API throws; the SQL proc still runs and the next 5-min
    // tick retries.
    let recovery: Awaited<ReturnType<typeof recoverOrphanedConversations>> | { skipped: true } = { skipped: true };
    try {
      recovery = await recoverOrphanedConversations(50, 200);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // eslint-disable-next-line no-console
      console.warn('[beithady-comm-sync] orphan recovery threw:', msg);
    }

    // Step 2 — SQL mirror.
    const { data, error } = await sb.rpc('beithady_communication_ingest');
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as
      | { conversations_upserted: number; messages_upserted: number; total_conversations: number; total_messages: number }
      | undefined;
    await recordAudit({
      module: 'communication',
      action: 'comm_sync_run',
      metadata: { ...(row as Record<string, unknown> || {}), recovery: recovery as Record<string, unknown> },
    });
    return NextResponse.json({ ok: true, result: row, recovery });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
