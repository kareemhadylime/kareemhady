import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';

// TikTok lead webhook receiver. TikTok For Business sends signed POSTs
// when a lead form (Instant Form) is submitted on a Spark/In-Feed ad.
//
// Configured under TikTok For Business → App → Webhooks → Lead.
// Payload includes lead_id + advertiser_id + form_id + field_data.

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  // TikTok URL-property verification — echoes back the verify token if set.
  const verifyToken = url.searchParams.get('tiktok_verify_token');
  if (verifyToken) {
    return new NextResponse(verifyToken, {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  // TikTok challenge param (some setups use ?challenge=)
  const challenge = url.searchParams.get('challenge');
  if (challenge) return new NextResponse(challenge, { status: 200 });
  return NextResponse.json({ ok: true, route: 'tiktok-leads' });
}

type TikTokLeadField = { name: string; value: string };
type TikTokLeadPayload = {
  lead_id?: string;
  advertiser_id?: string;
  campaign_id?: string;
  adgroup_id?: string;
  ad_id?: string;
  form_id?: string;
  form_name?: string;
  field_data?: TikTokLeadField[];
  created_time?: number | string;
};

export async function POST(req: NextRequest) {
  // Verify token in body or header (TikTok signs payloads via x-tt-signature
  // but we accept ?verify_token=… for the simple case until a signed flow ships)
  const expected = process.env.TIKTOK_LEAD_WEBHOOK_VERIFY_TOKEN || '';
  const url = new URL(req.url);
  const got = url.searchParams.get('verify_token') || req.headers.get('x-tt-verify-token') || '';
  if (expected && got && got !== expected) {
    return NextResponse.json({ ok: false, error: 'bad_token' }, { status: 403 });
  }

  let body: { data?: TikTokLeadPayload[] | TikTokLeadPayload } & TikTokLeadPayload = {};
  try { body = (await req.json()) as typeof body; }
  catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }); }

  const leadsArray: TikTokLeadPayload[] = Array.isArray(body.data)
    ? body.data
    : body.data
      ? [body.data]
      : (body.lead_id ? [body] : []);

  const sb = supabaseAdmin();
  let processed = 0;
  for (const lead of leadsArray) {
    if (!lead.lead_id) continue;
    const fields: Record<string, string> = {};
    for (const f of lead.field_data || []) {
      fields[(f.name || '').toLowerCase()] = f.value || '';
    }
    const fullName = fields.full_name || fields.name || null;
    const phoneRaw = fields.phone_number || fields.phone || null;
    const phoneE164 = phoneRaw ? '+' + phoneRaw.replace(/[^0-9]/g, '') : null;
    const email = fields.email || null;
    const country = fields.country || null;
    const buildingInterest = fields.building || fields.property || fields.unit || null;

    // Resolve ad → ad_set → campaign DB ids from TikTok ad_id
    let campaignDbId: number | null = null;
    let adSetDbId: number | null = null;
    let adDbId: number | null = null;
    if (lead.ad_id) {
      const { data: adRow } = await sb
        .from('ads_ads')
        .select('id, ad_set_id, ad_set:ads_ad_sets(id, campaign_id)')
        .eq('platform', 'tiktok').eq('external_id', lead.ad_id).maybeSingle();
      type AdRowWithRelations = { id: number; ad_set_id: number; ad_set?: { id: number; campaign_id: number } | null };
      const r = adRow as AdRowWithRelations | null;
      if (r) {
        adDbId = r.id;
        adSetDbId = r.ad_set_id;
        campaignDbId = r.ad_set?.campaign_id || null;
      }
    }

    const createdAt = lead.created_time
      ? (typeof lead.created_time === 'number'
          ? new Date(lead.created_time * 1000).toISOString()
          : new Date(lead.created_time).toISOString())
      : new Date().toISOString();

    const { error: insErr } = await sb.from('ads_leads').upsert(
      {
        platform: 'tiktok',
        external_id: lead.lead_id,
        ad_id: adDbId,
        ad_set_id: adSetDbId,
        campaign_id: campaignDbId,
        form_id: lead.form_id || null,
        form_name: lead.form_name || null,
        full_name: fullName,
        phone_raw: phoneRaw,
        phone_e164: phoneE164,
        email,
        country,
        building_interest: buildingInterest,
        lead_source: 'tiktok_lead_form',
        consent_granted: true,
        consent_granted_at: createdAt,
        raw_payload: lead,
        created_at: createdAt,
      },
      { onConflict: 'platform,external_id' }
    );
    if (!insErr) processed += 1;
  }

  await recordAudit({
    module: 'ads',
    action: 'webhook_tiktok_leads',
    metadata: { processed, count: leadsArray.length },
  });

  return NextResponse.json({ ok: true, processed });
}
