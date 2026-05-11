import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWhatsApp } from '@/lib/whatsapp/green-api';

// Lead SLA timer. Runs every 5 minutes during Cairo waking hours.
// Pings managers when a lead has been unanswered for > 30 minutes.
//
// "Answered" = first_response_at is set on the ads_leads row. That column
// is bumped by the WhatsApp inbox when an operator sends a message to the
// lead's phone (wiring lives in src/lib/beithady/communication/* — TODO
// follow-up will hook the actual send path; until then operators can
// mark-as-responded from the leads page UI).
//
// Each unresponded lead gets at most one WhatsApp alert (sla_alerted_at
// guard) so a backlog of stale leads doesn't spam managers.

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SLA_MINUTES = 30;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return false;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

async function loadManagerPhones(): Promise<string[]> {
  return (process.env.BEITHADY_OPS_ALERT_PHONES || '').split(',')
    .map(s => s.trim().replace(/^\+/, ''))
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const sb = supabaseAdmin();
  const slaCutoff = new Date(Date.now() - SLA_MINUTES * 60_000).toISOString();
  // Cap how far back we look so a 30-day-old unanswered lead doesn't keep alerting.
  const lookbackCutoff = new Date(Date.now() - 24 * 3600_000).toISOString();

  const { data } = await sb
    .from('ads_leads')
    .select('id, platform, full_name, phone_e164, country, building_interest, lead_source, created_at')
    .is('first_response_at', null)
    .is('sla_alerted_at', null)
    .lt('created_at', slaCutoff)
    .gt('created_at', lookbackCutoff)
    .order('created_at', { ascending: true })
    .limit(20);

  type LeadRow = { id: number; platform: string; full_name: string | null; phone_e164: string | null; country: string | null; building_interest: string | null; lead_source: string | null; created_at: string };
  const leads = (data as LeadRow[] | null) || [];
  if (leads.length === 0) {
    return NextResponse.json({ ok: true, fresh_alerts: 0 });
  }

  const phones = await loadManagerPhones();
  if (phones.length === 0) {
    // No alert recipients configured — still mark the leads as alerted
    // so we don't re-scan them every 5 min.
    await sb.from('ads_leads').update({ sla_alerted_at: new Date().toISOString() }).in('id', leads.map(l => l.id));
    return NextResponse.json({ ok: true, fresh_alerts: leads.length, skipped: 'no_recipient_phones' });
  }

  // One consolidated WhatsApp per cron run, listing up to 20 stale leads.
  const lines = [
    `*BH Ads — ${leads.length} unanswered lead${leads.length === 1 ? '' : 's'} (>${SLA_MINUTES}min)*`,
    '',
    ...leads.map(l => {
      const age = Math.round((Date.now() - new Date(l.created_at).getTime()) / 60_000);
      const who = l.full_name || l.phone_e164 || 'Unknown';
      const detail = [l.country, l.building_interest, l.platform].filter(Boolean).join(' · ');
      return `• ${who} (${age}min) — ${detail || '—'}`;
    }),
    '',
    'Open /beithady/ads/leads to respond.',
  ];
  const msg = lines.join('\n');

  const sendResults: Array<{ phone: string; ok: boolean }> = [];
  for (const phone of phones) {
    const r = await sendWhatsApp({ to: phone, message: msg });
    sendResults.push({ phone, ok: r.ok });
  }

  await sb.from('ads_leads').update({ sla_alerted_at: new Date().toISOString() }).in('id', leads.map(l => l.id));
  await sb.from('beithady_audit_log').insert({
    module: 'ads',
    action: 'lead_sla_alert',
    metadata: { fresh: leads.length, recipients: phones.length },
  });

  return NextResponse.json({ ok: true, fresh_alerts: leads.length, sent_to: phones.length, send_results: sendResults });
}
