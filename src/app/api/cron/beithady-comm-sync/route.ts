import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// Communication ingest cron — runs every 5 minutes via Vercel cron
// (vercel.json) and on-demand via ?force=1.
//
// Idempotent: the underlying SQL proc uses ON CONFLICT DO UPDATE, so
// re-running picks up new conversations + posts that arrived since
// the last run and refreshes denormalized fields.

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
    const { data, error } = await sb.rpc('beithady_communication_ingest');
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as
      | { conversations_upserted: number; messages_upserted: number; total_conversations: number; total_messages: number }
      | undefined;
    await recordAudit({
      module: 'communication',
      action: 'comm_sync_run',
      metadata: row as unknown as Record<string, unknown>,
    });
    return NextResponse.json({ ok: true, result: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
