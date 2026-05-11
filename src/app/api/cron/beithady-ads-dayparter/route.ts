import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { setCampaignStatusUnified } from '@/lib/beithady/ads/status';

// Dayparter — runs every 15 min during business hours. For each campaign
// with a `schedule` JSON set, checks whether the current Cairo-local
// (weekday, hour) tuple is in the allow-list and toggles the campaign's
// status accordingly. Uses the existing unified status dispatcher +
// auto_paused_at trail (same UI badge as budget-guard).

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

type Schedule = {
  weekday_hours?: Record<string, number[]>;
  timezone?: string;
};

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return false;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

function cairoWeekdayHour(): { day: string; hour: number } {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Cairo',
    weekday: 'short',
    hour: 'numeric',
    hour12: false,
  });
  const parts = f.formatToParts(new Date());
  const day = (parts.find(p => p.type === 'weekday')?.value || '').toLowerCase().slice(0, 3);
  const hour = Number(parts.find(p => p.type === 'hour')?.value || '0');
  return { day, hour };
}

function isInWindow(schedule: Schedule | null | undefined, day: string, hour: number): boolean {
  if (!schedule || !schedule.weekday_hours) return true; // No schedule = always on
  const allowedHours = schedule.weekday_hours[day];
  if (!allowedHours || allowedHours.length === 0) return false;
  return allowedHours.includes(hour);
}

type CampaignRow = {
  id: number;
  name: string;
  status: string | null;
  schedule: Schedule | null;
  auto_paused_at: string | null;
  auto_paused_reason: string | null;
};

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const sb = supabaseAdmin();
  const { day, hour } = cairoWeekdayHour();

  const { data } = await sb
    .from('ads_campaigns')
    .select('id, name, status, schedule, auto_paused_at, auto_paused_reason')
    .not('schedule', 'is', null);
  const campaigns = (data as CampaignRow[] | null) || [];

  let paused = 0, resumed = 0;
  const details: Array<{ campaign_id: number; name: string; action: string; reason?: string }> = [];

  for (const c of campaigns) {
    const inWindow = isInWindow(c.schedule, day, hour);
    const upperStatus = (c.status || '').toUpperCase();
    const isDayPaused = upperStatus === 'PAUSED' && (c.auto_paused_reason || '').startsWith('dayparter:');

    if (!inWindow && upperStatus === 'ACTIVE') {
      const reason = `dayparter: ${day} ${hour}:00 Cairo outside schedule`;
      const r = await setCampaignStatusUnified(c.id, 'PAUSED', reason);
      if (r.ok) {
        paused += 1;
        details.push({ campaign_id: c.id, name: c.name, action: 'paused', reason });
      }
    } else if (inWindow && isDayPaused) {
      const r = await setCampaignStatusUnified(c.id, 'ACTIVE');
      if (r.ok) {
        resumed += 1;
        details.push({ campaign_id: c.id, name: c.name, action: 'resumed' });
      }
    }
  }

  await sb.from('ads_sync_log').insert({
    job_name: 'beithady-ads-dayparter',
    platform: 'meta',
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    status: 'success',
    rows_upserted: paused + resumed,
    details: { cairo_day: day, cairo_hour: hour, paused, resumed, per_campaign: details },
  });

  return NextResponse.json({ ok: true, cairo_day: day, cairo_hour: hour, scanned: campaigns.length, paused, resumed, details });
}
