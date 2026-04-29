import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';
import { getSetting } from '@/lib/beithady/settings';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Phase R.3 — auto-archive cron.
// Runs nightly at 0 1 * * * UTC (4 AM Cairo winter, 3 AM Cairo summer).
// Predicate: any active conversation with no inbound activity for
// `comm_auto_archive_days` (default 90) gets archived.
//
// Safety:
//   - ?dry_run=1 returns count + sample without writing
//   - LIMIT comm_auto_archive_max_per_run rows per invocation (default
//     5000) so first run spreads across multiple nights
//   - comm_auto_archive_pause=true short-circuits the whole thing

function checkAuth(req: NextRequest): { ok: true } | { ok: false; reason: string } {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return { ok: true };
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return { ok: true };
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) {
    return { ok: true };
  }
  if (req.nextUrl.searchParams.get('secret') === expected) return { ok: true };
  return { ok: false, reason: 'missing_or_invalid_bearer' };
}

export async function GET(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });

  const dryRun = req.nextUrl.searchParams.get('dry_run') === '1';
  const sb = supabaseAdmin();

  // Read the three settings in parallel
  const [paused, daysSetting, maxPerRunSetting] = await Promise.all([
    getSetting<boolean>('comm_auto_archive_pause', false),
    getSetting<number>('comm_auto_archive_days', 90),
    getSetting<number>('comm_auto_archive_max_per_run', 5000),
  ]);

  if (paused) {
    return NextResponse.json({ ok: true, result: 'paused', archived: 0 });
  }

  const days = Math.max(1, Number(daysSetting) || 90);
  const maxPerRun = Math.max(100, Math.min(20_000, Number(maxPerRunSetting) || 5000));
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

  // Build the predicate. Two branches:
  //   1) state='closed' AND modified_at_external < cutoff
  //   2) state='open' AND (last_inbound_at IS NULL OR last_inbound_at < cutoff)
  // We can't easily express the OR in a single supabase chain, so we
  // collect candidate ids in two passes then UPDATE by id.
  const [closedRes, openRes] = await Promise.all([
    sb
      .from('beithady_conversations')
      .select('id')
      .is('archived_at', null)
      .eq('state', 'closed')
      .lt('modified_at_external', cutoff)
      .limit(maxPerRun),
    sb
      .from('beithady_conversations')
      .select('id, last_inbound_at')
      .is('archived_at', null)
      .eq('state', 'open')
      .or(`last_inbound_at.is.null,last_inbound_at.lt.${cutoff}`)
      .limit(maxPerRun),
  ]);

  const ids = [
    ...((closedRes.data as Array<{ id: string }> | null) || []),
    ...((openRes.data as Array<{ id: string }> | null) || []),
  ].map(r => r.id).slice(0, maxPerRun);

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      cutoff,
      threshold_days: days,
      max_per_run: maxPerRun,
      would_archive_count: ids.length,
      sample_ids: ids.slice(0, 25),
    });
  }

  let archivedCount = 0;
  if (ids.length > 0) {
    const { data: updated } = await sb
      .from('beithady_conversations')
      .update({
        archived_at: new Date().toISOString(),
        archived_reason: 'auto_cron_90d',
      })
      .in('id', ids)
      .is('archived_at', null) // race-safe: skip if another caller archived first
      .select('id');
    archivedCount = ((updated as Array<{ id: string }> | null) || []).length;
  }

  await recordAudit({
    module: 'communication',
    action: 'auto_archive_cron_run',
    metadata: {
      threshold_days: days,
      max_per_run: maxPerRun,
      cutoff,
      archived_count: archivedCount,
      candidate_count: ids.length,
    },
  });

  return NextResponse.json({
    ok: true,
    result: 'success',
    archived: archivedCount,
    candidate_count: ids.length,
    threshold_days: days,
  });
}
