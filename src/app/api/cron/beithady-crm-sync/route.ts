import { NextResponse } from 'next/server';
import { syncBeithadyGuests } from '@/lib/beithady/crm/guests-sync';
import { recordAudit } from '@/lib/beithady/audit';

// CRM sync cron: fired daily at 30 5 * * * UTC (07:30 / 08:30 Cairo).
// Bearer auth via CRON_SECRET; matches the existing pattern used by
// /api/cron/daily and /api/cron/beithady-daily-report. Use ?force=1
// to bypass any future scheduling gates (currently always runs since
// Phase B has no time-of-day guard).

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function checkAuth(req: Request): { ok: boolean; error?: string } {
  const expected = process.env.CRON_SECRET || '';
  const auth = req.headers.get('authorization') || '';
  // Vercel cron also sends `User-Agent: vercel-cron/1.0` and we accept
  // either the bearer secret or the well-known UA when no secret is set.
  if (!expected) return { ok: true };
  if (!auth.startsWith('Bearer ')) return { ok: false, error: 'missing_bearer' };
  const token = auth.slice('Bearer '.length).trim();
  if (token !== expected) return { ok: false, error: 'invalid_token' };
  return { ok: true };
}

async function handle(req: Request) {
  const auth = checkAuth(req);
  if (!auth.ok) return NextResponse.json({ ok: false, error: auth.error }, { status: 401 });

  const url = new URL(req.url);
  const trigger = url.searchParams.get('force') === '1' ? 'manual' : 'cron';

  try {
    const result = await syncBeithadyGuests({ trigger });
    if (!result.ok) {
      return NextResponse.json(result, { status: 500 });
    }
    await recordAudit({
      module: 'crm',
      action: 'crm_sync_completed',
      target_type: 'crm_run',
      target_id: result.run_id,
      metadata: {
        guests_upserted: result.guests_upserted,
        timeline_refreshed: result.timeline_refreshed,
        duration_ms: result.duration_ms,
        trigger,
      },
    });
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
