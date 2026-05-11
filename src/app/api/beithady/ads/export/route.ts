import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { listCampaigns, listLeadFunnel, listOverviewByDay, listCampaignRoas } from '@/lib/beithady/ads/reporting';

// Streaming CSV export for any BH Ads dataset. Query: ?dataset=campaigns
// |leads|daily|roas. Returns text/csv attached to "bh-ads-<dataset>-YYYYMMDD.csv".

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function csvEscape(v: unknown): string {
  if (v == null) return '';
  let s = typeof v === 'string' ? v : Array.isArray(v) ? v.join(' · ') : String(v);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    s = '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const header = columns.join(',');
  const body = rows
    .map(r => columns.map(c => csvEscape(r[c])).join(','))
    .join('\n');
  return header + '\n' + body + '\n';
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'ads', 'read'));
  if (!allowed) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const dataset = url.searchParams.get('dataset') || 'campaigns';
  const days = Math.max(1, Math.min(365, Number.parseInt(url.searchParams.get('days') || '90', 10) || 90));
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  let csv = '';
  let filename = '';

  if (dataset === 'campaigns') {
    const rows = await listCampaigns();
    filename = `bh-ads-campaigns-${today}.csv`;
    csv = toCsv(
      rows.map(r => ({
        campaign_id: r.campaign_id,
        campaign_name: r.campaign_name,
        platform: r.platform,
        status: r.campaign_status,
        objective: r.objective,
        building_codes: r.building_codes,
        impressions: r.impressions,
        clicks: r.clicks,
        spend_usd: r.spend,
        leads: r.leads,
        cpc_usd: r.cpc,
        cpl_usd: r.cpl,
        ctr_pct: r.ctr_pct,
        first_date: r.first_date,
        last_date: r.last_date,
      })),
      ['campaign_id', 'campaign_name', 'platform', 'status', 'objective', 'building_codes', 'impressions', 'clicks', 'spend_usd', 'leads', 'cpc_usd', 'cpl_usd', 'ctr_pct', 'first_date', 'last_date']
    );
  } else if (dataset === 'leads') {
    const rows = await listLeadFunnel({ limit: 5000 });
    filename = `bh-ads-leads-${today}.csv`;
    csv = toCsv(
      rows.map(r => ({
        lead_id: r.lead_id,
        created_at: r.created_at,
        platform: r.platform,
        campaign_id: r.campaign_id,
        campaign_name: r.campaign_name,
        building_codes: r.building_codes,
        full_name: r.full_name,
        phone_e164: r.phone_e164,
        email: r.email,
        country: r.country,
        building_interest: r.building_interest,
        funnel_stage: r.funnel_stage,
        matched_reservation_id: r.matched_reservation_id,
        matched_at: r.matched_at,
        booking_value: r.booking_value,
        booking_currency: r.booking_currency,
        booking_check_in: r.booking_check_in,
        sla_minutes: r.sla_minutes,
        first_response_at: r.first_response_at,
      })),
      ['lead_id', 'created_at', 'platform', 'campaign_id', 'campaign_name', 'building_codes', 'full_name', 'phone_e164', 'email', 'country', 'building_interest', 'funnel_stage', 'matched_reservation_id', 'matched_at', 'booking_value', 'booking_currency', 'booking_check_in', 'sla_minutes', 'first_response_at']
    );
  } else if (dataset === 'daily') {
    const rows = await listOverviewByDay(days);
    filename = `bh-ads-daily-${today}.csv`;
    csv = toCsv(
      rows.map(r => ({
        metric_date: r.metric_date,
        platform: r.platform,
        impressions: r.impressions,
        clicks: r.clicks,
        spend_usd: r.spend,
        leads: r.leads,
        cpl_usd: r.cpl,
      })),
      ['metric_date', 'platform', 'impressions', 'clicks', 'spend_usd', 'leads', 'cpl_usd']
    );
  } else if (dataset === 'roas') {
    const rows = await listCampaignRoas();
    filename = `bh-ads-roas-${today}.csv`;
    csv = toCsv(
      rows.map(r => ({
        campaign_id: r.campaign_id,
        campaign_name: r.campaign_name,
        platform: r.platform,
        spend_usd: r.spend,
        leads: r.leads,
        bookings: r.bookings,
        attributed_revenue_usd: r.attributed_revenue,
        roas: r.roas,
      })),
      ['campaign_id', 'campaign_name', 'platform', 'spend_usd', 'leads', 'bookings', 'attributed_revenue_usd', 'roas']
    );
  } else if (dataset === 'sync_log') {
    const sb = supabaseAdmin();
    const { data } = await sb
      .from('ads_sync_log')
      .select('id, job_name, platform, started_at, finished_at, status, rows_upserted, leads_ingested, error')
      .order('started_at', { ascending: false })
      .limit(1000);
    filename = `bh-ads-sync-log-${today}.csv`;
    csv = toCsv(
      ((data as Array<Record<string, unknown>> | null) || []),
      ['id', 'job_name', 'platform', 'started_at', 'finished_at', 'status', 'rows_upserted', 'leads_ingested', 'error']
    );
  } else {
    return NextResponse.json({ error: 'unknown_dataset', valid: ['campaigns', 'leads', 'daily', 'roas', 'sync_log'] }, { status: 400 });
  }

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
