import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWhatsApp } from '@/lib/whatsapp/green-api';

// Daily-spend anomaly detector. Runs hourly during business hours.
// Compares today's MTD-spend velocity to the trailing 7-day average and
// fires a WhatsApp alert to configured manager phones when:
//   - Today's spend is > 3x yesterday's spend (anomaly_high)
//   - Today's leads = 0 but spend > $X (anomaly_zero_leads)
//   - Trailing-7d ROAS < 1x with > $100 spend (anomaly_low_roas)
//
// Manager phones come from the BEITHADY_OPS_ALERT_PHONES env var
// (comma-separated E.164, e.g. "+201234567890,+201111111111").

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SPEND_SPIKE_MULTIPLIER = 3;       // today > 3× yesterday
const ZERO_LEADS_SPEND_FLOOR = 30;      // $30 spent with 0 leads = alert
const LOW_ROAS_SPEND_FLOOR = 100;       // only alert ROAS issues above $100 spend
const LOW_ROAS_THRESHOLD = 1.0;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return false;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

function cairoDateStr(offsetDays = 0): string {
  // Compute the Cairo-local YYYY-MM-DD for "today minus offsetDays"
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' });
  const d = new Date(Date.now() - offsetDays * 86_400_000);
  return f.format(d); // en-CA → YYYY-MM-DD
}

async function loadManagerPhones(): Promise<string[]> {
  const env = (process.env.BEITHADY_OPS_ALERT_PHONES || '').split(',')
    .map(s => s.trim().replace(/^\+/, ''))
    .filter(Boolean);
  return env;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const sb = supabaseAdmin();
  const today = cairoDateStr(0);
  const yesterday = cairoDateStr(1);
  const sevenDaysAgo = cairoDateStr(7);

  // Pull spend + leads for today + yesterday + trailing 7 days (campaign-level rows only).
  const { data } = await sb
    .from('ads_daily_metrics')
    .select('platform, metric_date, spend_micros, leads, conversion_value_micros')
    .is('ad_id', null)
    .is('ad_set_id', null)
    .gte('metric_date', sevenDaysAgo);

  type MetricRow = { platform: string; metric_date: string; spend_micros: number; leads: number; conversion_value_micros: number | null };
  const rows = (data as MetricRow[] | null) || [];

  // Aggregate per platform
  const perPlatform: Record<string, { today: number; yesterday: number; weekSpend: number; weekLeads: number; weekValue: number; todayLeads: number }> = {};
  for (const r of rows) {
    const p = (perPlatform[r.platform] ||= { today: 0, yesterday: 0, weekSpend: 0, weekLeads: 0, weekValue: 0, todayLeads: 0 });
    const spend = Number(r.spend_micros || 0) / 1_000_000;
    const leads = Number(r.leads || 0);
    const value = Number(r.conversion_value_micros || 0) / 1_000_000;
    p.weekSpend += spend;
    p.weekLeads += leads;
    p.weekValue += value;
    if (r.metric_date === today) {
      p.today += spend;
      p.todayLeads += leads;
    }
    if (r.metric_date === yesterday) {
      p.yesterday += spend;
    }
  }

  // Determine alerts
  const alerts: Array<{ kind: string; platform: string; detail: string }> = [];
  for (const [platform, p] of Object.entries(perPlatform)) {
    // 1. Spend spike
    if (p.today > 0 && p.yesterday > 0 && p.today > SPEND_SPIKE_MULTIPLIER * p.yesterday) {
      alerts.push({
        kind: 'spend_spike',
        platform,
        detail: `${platform} spend $${p.today.toFixed(2)} today is ${(p.today / p.yesterday).toFixed(1)}x yesterday ($${p.yesterday.toFixed(2)})`,
      });
    }
    // 2. Zero leads with material spend
    if (p.todayLeads === 0 && p.today >= ZERO_LEADS_SPEND_FLOOR) {
      alerts.push({
        kind: 'zero_leads',
        platform,
        detail: `${platform} spent $${p.today.toFixed(2)} today with 0 leads`,
      });
    }
    // 3. Low ROAS
    const roas = p.weekSpend > 0 ? p.weekValue / p.weekSpend : null;
    if (p.weekSpend >= LOW_ROAS_SPEND_FLOOR && roas != null && roas < LOW_ROAS_THRESHOLD) {
      alerts.push({
        kind: 'low_roas',
        platform,
        detail: `${platform} 7d ROAS ${roas.toFixed(2)}x on $${p.weekSpend.toFixed(2)} spend (< ${LOW_ROAS_THRESHOLD}x threshold)`,
      });
    }
  }

  if (alerts.length === 0) {
    return NextResponse.json({ ok: true, alerts: 0, per_platform: perPlatform });
  }

  // De-dupe — don't fire the same alert kind+platform more than once per 6h
  const dedupSinceIso = new Date(Date.now() - 6 * 3600_000).toISOString();
  const { data: recent } = await sb
    .from('beithady_audit_log')
    .select('action, metadata, created_at')
    .eq('module', 'ads')
    .eq('action', 'spend_anomaly_alert')
    .gte('created_at', dedupSinceIso)
    .limit(100);
  type RecentRow = { action: string; metadata: Record<string, unknown> | null; created_at: string };
  const seen = new Set<string>();
  for (const r of (recent as RecentRow[] | null) || []) {
    const k = `${(r.metadata as { kind?: string })?.kind || ''}|${(r.metadata as { platform?: string })?.platform || ''}`;
    seen.add(k);
  }
  const fresh = alerts.filter(a => !seen.has(`${a.kind}|${a.platform}`));

  if (fresh.length === 0) {
    return NextResponse.json({ ok: true, alerts: alerts.length, fresh: 0, deduped: alerts.length });
  }

  const phones = await loadManagerPhones();
  const lines = ['*BH Ads — anomaly alert*', '', ...fresh.map(a => `• ${a.detail}`), '', 'Open /beithady/ads/performance to investigate.'];
  const msg = lines.join('\n');

  const sendResults: Array<{ phone: string; ok: boolean }> = [];
  for (const phone of phones) {
    const r = await sendWhatsApp({ to: phone, message: msg });
    sendResults.push({ phone, ok: r.ok });
  }

  // Audit-log each alert so the dedup window sees them next run
  for (const a of fresh) {
    await sb.from('beithady_audit_log').insert({
      module: 'ads',
      action: 'spend_anomaly_alert',
      metadata: { kind: a.kind, platform: a.platform, detail: a.detail, recipients: phones.length },
    });
  }

  return NextResponse.json({ ok: true, alerts: alerts.length, fresh: fresh.length, sent_to: phones.length, send_results: sendResults });
}
