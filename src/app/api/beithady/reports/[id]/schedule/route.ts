// POST/GET/DELETE schedule for a saved report.
// Frequency: daily/weekly/monthly. Computes next_fire_at on write.

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

type ScheduleBody = {
  frequency: 'daily' | 'weekly' | 'monthly';
  day_of_week?: number;
  day_of_month?: number;
  hour_cairo: number;
  email_recipients?: string[];
  wa_channel_ids?: string[];
  enabled?: boolean;
};

function computeNextFireAt(s: ScheduleBody): string {
  // Cairo is UTC+2 (no DST as of 2024+). Calculate next fire in UTC.
  const CAIRO_OFFSET_HOURS = 2;
  const now = new Date();
  const utcHour = (s.hour_cairo - CAIRO_OFFSET_HOURS + 24) % 24;
  const next = new Date(now);
  next.setUTCHours(utcHour, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);

  if (s.frequency === 'weekly' && s.day_of_week != null) {
    while (next.getUTCDay() !== s.day_of_week) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
  } else if (s.frequency === 'monthly' && s.day_of_month != null) {
    while (next.getUTCDate() !== s.day_of_month) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
  }
  return next.toISOString();
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await hasBeithadyPermission(user, 'analytics', 'full'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json()) as ScheduleBody;
  if (!body.frequency || body.hour_cairo == null) {
    return NextResponse.json({ error: 'invalid schedule' }, { status: 400 });
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('beithady_report_schedules')
    .insert({
      report_id: id,
      frequency: body.frequency,
      day_of_week: body.day_of_week ?? null,
      day_of_month: body.day_of_month ?? null,
      hour_cairo: body.hour_cairo,
      email_recipients: body.email_recipients ?? [],
      wa_channel_ids: body.wa_channel_ids ?? [],
      enabled: body.enabled ?? true,
      next_fire_at: computeNextFireAt(body),
    })
    .select('id, next_fire_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id, next_fire_at: data.next_fire_at });
}

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await hasBeithadyPermission(user, 'analytics', 'read'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('beithady_report_schedules')
    .select('*')
    .eq('report_id', id)
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ schedules: data || [] });
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await hasBeithadyPermission(user, 'analytics', 'full'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const scheduleId = url.searchParams.get('scheduleId');
  if (!scheduleId)
    return NextResponse.json({ error: 'scheduleId required' }, { status: 400 });

  const sb = supabaseAdmin();
  const { error } = await sb
    .from('beithady_report_schedules')
    .delete()
    .eq('id', scheduleId)
    .eq('report_id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
