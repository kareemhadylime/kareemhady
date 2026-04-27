import { NextRequest, NextResponse } from 'next/server';
import { processQueuedJobs } from '@/lib/beithady/gallery/ai-label';
import { recordAudit } from '@/lib/beithady/audit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// AI labeling cron — runs every 2 minutes. Picks up to 5 queued jobs
// per tick, calls Claude vision, writes tags + caption + quality
// score. Cap of 5 prevents rate-limit storms.

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return true;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  try {
    const result = await processQueuedJobs(5);
    if (result.attempted > 0) {
      await recordAudit({
        module: 'gallery',
        action: 'ai_label_queue_run',
        metadata: result as unknown as Record<string, unknown>,
      });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
