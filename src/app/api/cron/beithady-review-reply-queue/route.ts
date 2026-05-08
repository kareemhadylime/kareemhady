import { NextRequest, NextResponse } from 'next/server';
import { processReviewReplyQueue } from '@/lib/beithady/pipeline/review-replies';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) {
    console.error('[cron beithady-review-reply-queue] CRON_SECRET unset — refusing');
    return false;
  }
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

// Daily 04:00 Cairo (01:00 UTC). Generates AI drafts for any new
// guesty_reviews without a beithady_review_replies row yet. Up to 20
// per run to fit Anthropic rate limits.
export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  try {
    const result = await processReviewReplyQueue(20);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
