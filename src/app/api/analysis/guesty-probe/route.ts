import { NextRequest, NextResponse } from 'next/server';
import { listGuestyListings } from '@/lib/guesty';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const res = await listGuestyListings({ limit: 3 });
    const sample = (res.results || []).find(l =>
      /\bBH-?73/i.test(String(l.nickname || ''))
    ) || res.results?.[0];
    if (!sample) {
      return NextResponse.json({ ok: false, error: 'no listings returned' });
    }
    return NextResponse.json({
      ok: true,
      nickname: sample.nickname,
      all_keys: Object.keys(sample).sort(),
      full_sample: sample,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
