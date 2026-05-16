import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { takeSnapshot } from '@/lib/personal/networth/snapshot';

export const maxDuration = 60;

function cairoHour(): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', hour12: false })
      .format(new Date())
  );
}

export async function POST(req: Request): Promise<Response> {
  const auth = req.headers.get('authorization');
  if (!auth || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';
  if (!force && cairoHour() !== 9) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'not 9am Cairo' });
  }

  const sb = supabaseAdmin();
  const { data: users, error } = await sb
    .from('personal_networth_settings').select('app_user_id');
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  // Per-user try/catch: a failure for one user must not abort snapshots for
  // the rest. Single-tenant today, but the schema + route are written multi-user.
  const results: Array<{
    appUserId: string;
    snapshotId?: string;
    netWorthEgp?: number;
    error?: string;
  }> = [];
  for (const u of users ?? []) {
    try {
      const r = await takeSnapshot(u.app_user_id, 'monthly_auto');
      results.push({ appUserId: u.app_user_id, ...r });
    } catch (e) {
      results.push({
        appUserId: u.app_user_id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return NextResponse.json({ ok: true, results });
}
