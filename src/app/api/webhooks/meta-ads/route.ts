import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { loadMetaCredentials, metaGet } from '@/lib/beithady/ads/meta-client';
import { recordAudit } from '@/lib/beithady/audit';

// Meta Ads webhook receiver — handles two payload types:
//   1) Meta Lead Ads form submissions (entry[].changes[].field === 'leadgen')
//      → fetch full lead via /{leadgen_id} and upsert into ads_leads
//   2) Meta verification challenge (GET ?hub.mode=subscribe&hub.verify_token=...)
//
// Configured under Meta App Dashboard → Webhooks → Page → leadgen field.
// Verify token comes from META_LEAD_FORM_WEBHOOK_VERIFY_TOKEN env (or the
// integration_credentials provider record).

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Meta GET verification challenge
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge');
  const expected = process.env.META_LEAD_FORM_WEBHOOK_VERIFY_TOKEN || '';
  if (mode === 'subscribe' && token && expected && token === expected) {
    return new NextResponse(challenge || '', {
      status: 200,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }
  return NextResponse.json({ ok: false, error: 'verify_failed' }, { status: 403 });
}

type LeadFieldData = { name: string; values: string[] };
type LeadGenEntry = {
  field: 'leadgen';
  value: { leadgen_id: string; form_id: string; page_id?: string; ad_id?: string; adgroup_id?: string; created_time?: number };
};

export async function POST(req: NextRequest) {
  let body: { entry?: Array<{ id?: string; changes?: LeadGenEntry[] }> } = {};
  try { body = (await req.json()) as typeof body; }
  catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }); }

  const sb = supabaseAdmin();
  const credsRes = await loadMetaCredentials();

  let processed = 0;
  for (const entry of body.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'leadgen') continue;
      const leadgenId = change.value?.leadgen_id;
      if (!leadgenId) continue;

      // Fetch full lead from Graph API
      let leadData: { id: string; field_data?: LeadFieldData[]; form_id?: string; ad_id?: string; created_time?: string } | null = null;
      if (credsRes.ok) {
        const r = await metaGet<{ id: string; field_data?: LeadFieldData[]; form_id?: string; ad_id?: string; created_time?: string }>(
          `${leadgenId}?fields=id,form_id,ad_id,adgroup_id,created_time,field_data`,
          credsRes.creds.token
        );
        if (r.ok) leadData = r.data;
      }

      // Extract common fields from field_data
      const fields: Record<string, string> = {};
      for (const f of leadData?.field_data || []) {
        const v = (f.values || [])[0] || '';
        fields[f.name.toLowerCase()] = v;
      }
      const fullName = fields.full_name || fields.name || null;
      const phoneRaw = fields.phone_number || fields.phone || null;
      const phoneE164 = phoneRaw ? '+' + phoneRaw.replace(/[^0-9]/g, '') : null;
      const email = fields.email || null;
      const country = fields.country || null;
      const buildingInterest = fields.building || fields.property || fields.unit || null;

      // Lookup campaign_id from ad_id if possible
      let campaignDbId: number | null = null;
      let adSetDbId: number | null = null;
      let adDbId: number | null = null;
      const adExternalId = change.value?.ad_id || leadData?.ad_id || null;
      if (adExternalId) {
        const { data: adRow } = await sb
          .from('ads_ads')
          .select('id, ad_set_id, ad_set:ads_ad_sets(id, campaign_id)')
          .eq('platform', 'meta').eq('external_id', adExternalId).maybeSingle();
        type AdRowWithRelations = { id: number; ad_set_id: number; ad_set?: { id: number; campaign_id: number } | null };
        const r = adRow as AdRowWithRelations | null;
        if (r) {
          adDbId = r.id;
          adSetDbId = r.ad_set_id;
          campaignDbId = r.ad_set?.campaign_id || null;
        }
      }

      const { error: insErr } = await sb.from('ads_leads').upsert(
        {
          platform: 'meta',
          external_id: leadgenId,
          ad_id: adDbId,
          ad_set_id: adSetDbId,
          campaign_id: campaignDbId,
          form_id: leadData?.form_id || null,
          form_name: leadData?.form_id || null,
          full_name: fullName,
          phone_raw: phoneRaw,
          phone_e164: phoneE164,
          email,
          country,
          building_interest: buildingInterest,
          lead_source: 'meta_lead_form',
          consent_granted: true,
          consent_granted_at: leadData?.created_time || new Date().toISOString(),
          raw_payload: { entry, lead: leadData },
          created_at: leadData?.created_time ? new Date(leadData.created_time).toISOString() : new Date().toISOString(),
        },
        { onConflict: 'platform,external_id' }
      );
      if (!insErr) processed += 1;
    }
  }

  await recordAudit({
    module: 'ads',
    action: 'webhook_meta_leads',
    metadata: { processed, entries: body.entry?.length || 0 },
  });

  return NextResponse.json({ ok: true, processed });
}
