import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWhatsApp } from '@/lib/whatsapp/green-api';

// Daily structured-data sanity check. Fetches each /stay/[code] page,
// extracts the JSON-LD blob, validates the shape we expect (correct
// @type, required schema.org fields), and alerts on any failure.
// Cheaper than Google's Rich Results Test API and doesn't need an API
// key. Catches regressions when the template changes.

export const dynamic = 'force-dynamic';
export const maxDuration = 180;

function checkAuth(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET || '';
  if (!expected) return false;
  const got = req.headers.get('authorization') || '';
  if (got === `Bearer ${expected}`) return true;
  if (req.nextUrl.searchParams.get('force') === '1' && req.nextUrl.searchParams.get('secret') === expected) return true;
  return false;
}

type JsonLd = {
  '@type'?: string;
  '@context'?: string;
  name?: string;
  description?: string | null;
  image?: string[] | string;
  address?: Record<string, unknown>;
  url?: string;
};

type Failure = { code: string; reason: string };

export async function GET(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://app.limeinc.cc').replace(/\/$/, '');

  const sb = supabaseAdmin();
  const { data: listingsRaw } = await sb
    .from('guesty_listings')
    .select('building_code')
    .eq('active', true)
    .not('building_code', 'is', null);
  const codes = Array.from(
    new Set(((listingsRaw as Array<{ building_code: string | null }> | null) || []).map(r => r.building_code).filter(Boolean) as string[])
  );

  const failures: Failure[] = [];
  const passed: string[] = [];

  for (const code of codes) {
    const url = `${base}/stay/${code}`;
    let html: string;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20_000), headers: { 'User-Agent': 'BeitHady-JSONLD-Check/1.0' } });
      if (!r.ok) { failures.push({ code, reason: `http_${r.status}` }); continue; }
      html = await r.text();
    } catch (e) {
      failures.push({ code, reason: `fetch_threw: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }

    const ldMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
    if (!ldMatch) { failures.push({ code, reason: 'no_jsonld_block' }); continue; }

    let parsed: JsonLd;
    try { parsed = JSON.parse(ldMatch[1]); }
    catch { failures.push({ code, reason: 'jsonld_invalid_json' }); continue; }

    // Validate shape
    if (parsed['@context'] !== 'https://schema.org') { failures.push({ code, reason: 'wrong_context' }); continue; }
    if (parsed['@type'] !== 'LodgingBusiness') { failures.push({ code, reason: `wrong_type: ${parsed['@type']}` }); continue; }
    if (!parsed.name) { failures.push({ code, reason: 'missing_name' }); continue; }

    passed.push(code);
  }

  const startedAt = new Date().toISOString();
  await sb.from('ads_sync_log').insert({
    job_name: 'beithady-ads-jsonld-check',
    platform: 'meta',
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    status: failures.length === 0 ? 'success' : 'partial',
    rows_upserted: passed.length,
    error: failures.length > 0 ? `${failures.length} failures` : null,
    details: { passed: passed.length, failed: failures.length, failures },
  });

  // Alert if any failed
  if (failures.length > 0) {
    const phones = (process.env.BEITHADY_OPS_ALERT_PHONES || '').split(',').map(p => p.trim().replace(/^\+/, '')).filter(Boolean);
    if (phones.length > 0) {
      const lines = [
        `*BH SEO — JSON-LD validation failed (${failures.length}/${codes.length})*`,
        '',
        ...failures.slice(0, 10).map(f => `• ${f.code}: ${f.reason}`),
        '',
        'Schema.org rich-results may be missing for these buildings.',
      ];
      for (const phone of phones) {
        await sendWhatsApp({ to: phone, message: lines.join('\n') });
      }
    }
  }

  return NextResponse.json({ ok: failures.length === 0, total: codes.length, passed: passed.length, failed: failures.length, failures });
}
