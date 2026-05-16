import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWhatsApp } from '@/lib/whatsapp/green-api';
import { detectAnomalies, type AnomalyEvent } from '@/lib/beithady/ads/anomalies';

// Daily-spend anomaly detector. Runs hourly during business hours.
// Detection logic lives in `@/lib/beithady/ads/anomalies` (shared with the
// V3 dashboard banner). This cron only adds dedup + WhatsApp + audit logging.
//
// Manager phones come from the BEITHADY_OPS_ALERT_PHONES env var
// (comma-separated E.164, e.g. "+201234567890,+201111111111").

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return false;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

async function loadManagerPhones(): Promise<string[]> {
  const env = (process.env.BEITHADY_OPS_ALERT_PHONES || '').split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return env;
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const sb = supabaseAdmin();

  // Detect anomalies via the shared lib (same logic the dashboard banner uses).
  const events = await detectAnomalies();
  if (events.length === 0) {
    return NextResponse.json({ ok: true, alerts: 0 });
  }

  // De-dupe — don't fire the same kind+platform more than once per 6h
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
  const fresh = events.filter((e: AnomalyEvent) => !seen.has(`${e.type}|${e.platform}`));

  if (fresh.length === 0) {
    return NextResponse.json({ ok: true, alerts: events.length, fresh: 0, deduped: events.length });
  }

  const phones = await loadManagerPhones();
  const lines = ['*BH Ads — anomaly alert*', '', ...fresh.map(a => `• ${a.message}`), '', 'Open /beithady/ads/performance to investigate.'];
  const msg = lines.join('\n');

  const sendResults: Array<{ phone: string; ok: boolean }> = [];
  for (const phone of phones) {
    const r = await sendWhatsApp({ to: phone, message: msg });
    sendResults.push({ phone, ok: r.ok });
  }

  // Audit-log each alert so the dedup window sees them next run.
  // Keep the legacy `kind`/`detail` key names so the dedup query above (which reads
  // historical rows) keeps working without a backfill.
  for (const a of fresh) {
    await sb.from('beithady_audit_log').insert({
      module: 'ads',
      action: 'spend_anomaly_alert',
      metadata: { kind: a.type, platform: a.platform, detail: a.message, recipients: phones.length },
    });
  }

  return NextResponse.json({ ok: true, alerts: events.length, fresh: fresh.length, sent_to: phones.length, send_results: sendResults });
}
