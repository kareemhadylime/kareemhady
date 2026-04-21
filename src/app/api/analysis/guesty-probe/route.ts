import { NextRequest, NextResponse } from 'next/server';
import { listGuestyListings, guestyFetch } from '@/lib/guesty';

// One-shot probe: fetch ONE BH-73 listing without any field projection so
// we can see Guesty's actual top-level key names and find where multi-unit
// parent/child metadata lives.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  // 1. Quick listing that we know matches BH-73
  const listRes = await listGuestyListings({ limit: 2 });
  const firstWithBh73 =
    (listRes.results || []).find(l =>
      /\bBH-?73/i.test(String(l.nickname || ''))
    ) || listRes.results?.[0];
  if (!firstWithBh73) {
    return NextResponse.json({ ok: false, error: 'no listings' }, { status: 500 });
  }

  // 2. Fetch its full detail directly (no fields projection)
  const detail = await guestyFetch<Record<string, unknown>>(
    `/listings/${firstWithBh73._id}`
  );

  return NextResponse.json({
    ok: true,
    probed_id: firstWithBh73._id,
    probed_nickname: firstWithBh73.nickname,
    top_level_keys: detail ? Object.keys(detail).sort() : [],
    multi_unit_related_keys: detail
      ? Object.keys(detail).filter(k =>
          /type|parent|master|multi|child|unit|group/i.test(k)
        )
      : [],
    multi_unit_related_values: Object.fromEntries(
      Object.entries(detail || {}).filter(([k]) =>
        /type|parent|master|multi|child|unit|group/i.test(k)
      )
    ),
  });
}
