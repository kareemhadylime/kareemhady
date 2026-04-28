import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWaCasualMessage } from '@/lib/beithady/communication/send-wa-casual';
import { recordAudit } from '@/lib/beithady/audit';
import { getUpcomingArrivals, matchBeithadyGuest, mintToken, templateRender } from './reservation-helpers';

const PUBLIC_BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://limeinc.vercel.app';
const BOARDING_TTL_DAYS = 30;

export async function runBoardingPassDispatch(): Promise<{
  considered: number;
  sent: number;
  skipped: number;
  errors: Array<{ reservation_id: string; error: string }>;
}> {
  const sb = supabaseAdmin();
  // Window: check-in is 18-30h from now (10:30 Cairo cron after pre-arrival)
  const arrivals = await getUpcomingArrivals(18, 30);
  let sent = 0;
  let skipped = 0;
  const errors: Array<{ reservation_id: string; error: string }> = [];

  // Approval gate (migration 0050): boarding-pass body is a DB template,
  // not hardcoded. Refuse to fire if no enabled+approved template exists.
  const { data: tplRows } = await sb
    .from('beithady_pre_arrival_templates')
    .select('building_code, body, approved_at, approved_body')
    .eq('purpose', 'boarding_pass')
    .eq('enabled', true)
    .not('approved_at', 'is', null);
  const tpls = new Map<string | 'fallback', string>();
  for (const t of (tplRows as Array<{ building_code: string | null; body: string; approved_at: string | null; approved_body: string | null }> | null) || []) {
    if (!t.approved_at || t.body !== t.approved_body) continue;
    const k = t.building_code === null ? 'fallback' : t.building_code;
    tpls.set(k, t.body);
  }
  if (tpls.size === 0) {
    await recordAudit({
      module: 'communication',
      action: 'boarding_pass_dispatch_blocked',
      metadata: { reason: 'no_approved_template', considered: arrivals.length },
    });
    return { considered: arrivals.length, sent: 0, skipped: arrivals.length, errors: [] };
  }

  for (const r of arrivals) {
    if (!r.id) { skipped++; continue; }
    const guest = await matchBeithadyGuest(r.guest_email, r.guest_phone);
    if (!guest || !guest.phone_e164) { skipped++; continue; }

    // Idempotency
    const { data: existing } = await sb
      .from('beithady_boarding_passes')
      .select('id, token, sent_at')
      .eq('reservation_id', r.id)
      .maybeSingle();
    if (existing && (existing as { sent_at: string | null }).sent_at) { skipped++; continue; }

    const token = (existing as { token: string } | null)?.token || mintToken(24);
    const expiresAt = new Date(Date.now() + BOARDING_TTL_DAYS * 86400e3).toISOString();
    const url = `${PUBLIC_BASE}/r/beithady/stay/${token}`;

    const firstName = (guest.full_name || r.guest_name || 'there').split(' ')[0];
    const tplBody = (r.building_code && tpls.get(r.building_code)) || tpls.get('fallback');
    if (!tplBody) { skipped++; continue; }
    const body = templateRender(tplBody, {
      guest_name: firstName,
      listing: r.listing_nickname || 'your apartment',
      check_in: r.check_in_date || '',
      host_phone: '+201101300300',
      stay_url: url,
    });

    const { data: convId, error: convErr } = await sb.rpc('beithady_ensure_wa_casual_conversation', {
      p_phone_digits: guest.phone_e164.replace(/[^0-9]/g, ''),
      p_guest_name: guest.full_name || r.guest_name,
    });
    if (convErr || !convId) {
      errors.push({ reservation_id: r.id, error: convErr?.message || 'no_conversation' });
      continue;
    }

    const result = await sendWaCasualMessage({
      beithadyConversationId: convId as string,
      body,
      agentUserId: null,
      agentDisplayName: 'Beit Hady automated',
    });

    if (existing) {
      await sb.from('beithady_boarding_passes').update({
        sent_at: new Date().toISOString(),
        message_id: result.ok ? result.messageId : null,
      }).eq('id', (existing as { id: string }).id);
    } else {
      await sb.from('beithady_boarding_passes').insert({
        reservation_id: r.id,
        guest_id: guest.id,
        building_code: r.building_code,
        listing_id: r.listing_id,
        token,
        expires_at: expiresAt,
        message_id: result.ok ? result.messageId : null,
        sent_at: result.ok ? new Date().toISOString() : null,
      });
    }

    if (result.ok) sent++;
    else errors.push({ reservation_id: r.id, error: result.error });
  }

  await recordAudit({
    module: 'communication',
    action: 'boarding_pass_dispatch_run',
    metadata: { considered: arrivals.length, sent, skipped, error_count: errors.length },
  });

  return { considered: arrivals.length, sent, skipped, errors };
}

export type BoardingBundle = {
  reservation_id: string;
  guest_first_name: string;
  building_code: string | null;
  listing_id: string | null;
  listing_nickname: string | null;
  check_in: string | null;
  check_out: string | null;
  nights: number | null;
  source: string | null;
  host_phone_e164: string;
  gallery: Array<{ id: string; storage_path: string; public_url: string | null; ai_caption: string | null }>;
  upsell_skus: Array<{ sku: string; name: string; description: string | null; price_usd: number }>;
  expires_at: string;
};

// Loader for the public boarding-pass page. Validates token + expiry,
// records a view + view_count++.
export async function loadBoardingByToken(token: string): Promise<BoardingBundle | null> {
  const sb = supabaseAdmin();
  const { data: bp } = await sb
    .from('beithady_boarding_passes')
    .select('id, reservation_id, building_code, listing_id, expires_at, viewed_at, view_count, guest_id')
    .eq('token', token)
    .maybeSingle();
  if (!bp) return null;
  const b = bp as {
    id: string; reservation_id: string; building_code: string | null;
    listing_id: string | null; expires_at: string; viewed_at: string | null;
    view_count: number; guest_id: string | null;
  };
  if (new Date(b.expires_at).getTime() < Date.now()) return null;

  // Bump view counter
  await sb.from('beithady_boarding_passes').update({
    viewed_at: b.viewed_at || new Date().toISOString(),
    view_count: b.view_count + 1,
  }).eq('id', b.id);

  // Pull reservation
  const { data: res } = await sb
    .from('guesty_reservations')
    .select('guest_name, check_in_date, check_out_date, nights, source, listing_nickname')
    .eq('id', b.reservation_id)
    .maybeSingle();
  const r = (res as { guest_name: string | null; check_in_date: string | null; check_out_date: string | null; nights: number | null; source: string | null; listing_nickname: string | null } | null);

  // Pull a few gallery photos for this listing or building
  let gallery: BoardingBundle['gallery'] = [];
  if (b.listing_id || b.building_code) {
    let q = sb
      .from('beithady_gallery_assets')
      .select('id, storage_path, public_url, ai_caption')
      .eq('category', 'photo')
      .is('deleted_at', null)
      .limit(8);
    if (b.listing_id) q = q.eq('listing_id', b.listing_id);
    else if (b.building_code) q = q.eq('building_code', b.building_code);
    const { data } = await q.order('created_at', { ascending: false });
    gallery = (data as Array<{ id: string; storage_path: string; public_url: string | null; ai_caption: string | null }> | null) || [];
  }

  // Pull upsell catalog (filtered to building or universal)
  let upsellSkus: BoardingBundle['upsell_skus'] = [];
  const { data: skus } = await sb
    .from('beithady_upsell_catalog')
    .select('sku, name, description, price_usd, building_code')
    .eq('enabled', true)
    .order('display_order', { ascending: true });
  if (skus) {
    upsellSkus = (skus as Array<{ sku: string; name: string; description: string | null; price_usd: number; building_code: string | null }>)
      .filter(s => s.building_code === null || s.building_code === b.building_code)
      .slice(0, 6)
      .map(s => ({ sku: s.sku, name: s.name, description: s.description, price_usd: Number(s.price_usd) }));
  }

  // Get guest first name
  let guestFirstName = 'there';
  if (b.guest_id) {
    const { data: g } = await sb
      .from('beithady_guests')
      .select('full_name')
      .eq('id', b.guest_id)
      .maybeSingle();
    const fn = (g as { full_name: string | null } | null)?.full_name;
    if (fn) guestFirstName = fn.split(' ')[0];
  } else if (r?.guest_name) {
    guestFirstName = r.guest_name.split(' ')[0];
  }

  return {
    reservation_id: b.reservation_id,
    guest_first_name: guestFirstName,
    building_code: b.building_code,
    listing_id: b.listing_id,
    listing_nickname: r?.listing_nickname || null,
    check_in: r?.check_in_date || null,
    check_out: r?.check_out_date || null,
    nights: r?.nights || null,
    source: r?.source || null,
    host_phone_e164: '+201101300300',
    gallery,
    upsell_skus: upsellSkus,
    expires_at: b.expires_at,
  };
}
