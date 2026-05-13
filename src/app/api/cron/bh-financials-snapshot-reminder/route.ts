import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { nextSnapshotDue } from '@/lib/beithady/financials/cadence';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function cairoLocalHour(now: Date = new Date()): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    hour: 'numeric',
    hour12: false,
  });
  return Number(f.format(now));
}

export async function GET(req: Request) {
  if (!process.env.CRON_SECRET) {
    // Fail closed when secret is unset; otherwise an `Authorization: Bearer `
    // (literal trailing space) request would pass the auth check.
    return NextResponse.json({ ok: false, error: 'unconfigured' }, { status: 503 });
  }
  const auth = req.headers.get('Authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';
  const h = cairoLocalHour();
  if (!force && h !== 9) {
    return NextResponse.json({ skipped: true, cairo_hour: h });
  }

  const sb = supabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const { data: frozen } = await sb
    .from('bh_balance_snapshots')
    .select('period_end')
    .eq('company_scope', 'consolidated')
    .eq('status', 'frozen');
  const frozenSet = new Set((frozen ?? []).map((r) => r.period_end as string));

  const next = nextSnapshotDue(today, frozenSet);
  if (!next || !next.is_overdue) {
    return NextResponse.json({ ok: true, overdue: false });
  }

  // Upsert reminder row (idempotent per quarter).
  await sb
    .from('bh_financials_reminders')
    .upsert(
      {
        period_end: next.period_end,
        company_scope: 'consolidated',
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: 'period_end,company_scope' },
    );

  // WhatsApp + morning-brief integration deferred (T28 / future work).
  return NextResponse.json({ ok: true, overdue: true, period_end: next.period_end });
}
