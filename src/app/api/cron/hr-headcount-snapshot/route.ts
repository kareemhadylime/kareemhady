// src/app/api/cron/hr-headcount-snapshot/route.ts
// Daily 9 AM Cairo — upserts on_job headcount per building×department into hr_headcount_snapshots.
// DST-safe: vercel.json registers UTC 06:00 + 07:00; handler gates on Cairo hour == 9.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return false;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

function cairoHour(): number {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    hour: 'numeric',
    hour12: false,
  });
  return Number(f.format(new Date()));
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const force = req.nextUrl.searchParams.get('force') === '1';
  const hour  = cairoHour();
  if (!force && hour !== 9) {
    return NextResponse.json({ ok: true, skipped: 'not_cairo_9am', cairo_hour: hour });
  }

  try {
    const sb    = supabaseAdmin();
    const today = new Date().toISOString().slice(0, 10);

    // Count on_job employees grouped by building_code + department
    const { data: emps, error: eErr } = await sb
      .from('hr_employees')
      .select('building_code, department')
      .eq('status', 'on_job');
    if (eErr) throw new Error(eErr.message);

    const countMap = new Map<string, { building_code: string; department: string; count: number }>();
    for (const e of (emps ?? []) as { building_code: string | null; department: string }[]) {
      const bc  = e.building_code ?? 'OTHER';
      const key = `${bc}__${e.department}`;
      const existing = countMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        countMap.set(key, { building_code: bc, department: e.department, count: 1 });
      }
    }

    const rows = Array.from(countMap.values()).map(r => ({
      date:          today,
      building_code: r.building_code,
      department:    r.department,
      count:         r.count,
    }));

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, upserted: 0, date: today });
    }

    const { error: uErr } = await sb
      .from('hr_headcount_snapshots')
      .upsert(rows, { onConflict: 'date,building_code,department' });
    if (uErr) throw new Error(uErr.message);

    return NextResponse.json({ ok: true, upserted: rows.length, date: today });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
