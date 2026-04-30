import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWaCasualMessage } from '@/lib/beithady/communication/send-wa-casual';
import { recordAudit } from '@/lib/beithady/audit';
import { isAutomationPaused } from '@/lib/beithady/automations';
import { getUpcomingArrivals, matchBeithadyGuest, templateRender } from './reservation-helpers';

const HOST_PHONE_DEFAULT = '+201101300300'; // matches the existing brand WABA presence

export async function runPreArrivalDispatch(): Promise<{
  considered: number;
  sent: number;
  skipped: number;
  errors: Array<{ reservation_id: string; error: string }>;
  paused?: boolean;
}> {
  // Phase C.5 follow-up — granular kill switch for pre-arrival.
  if (await isAutomationPaused('pre_arrival')) {
    return { considered: 0, sent: 0, skipped: 0, errors: [], paused: true };
  }
  const sb = supabaseAdmin();
  // Window: check-in is 12-30h from now, so the 10:00 Cairo cron picks
  // up tomorrow's arrivals in a 24h-ish window.
  const arrivals = await getUpcomingArrivals(12, 30);
  let sent = 0;
  let skipped = 0;
  const errors: Array<{ reservation_id: string; error: string }> = [];

  // Load all relevant templates upfront (one query). Approval gate
  // (added migration 0049 after the A1 Hospitality incident): a row
  // can ONLY fire if enabled=true AND approved_at IS NOT NULL AND
  // body == approved_body. The body==approved_body check defends
  // against a race where someone edits the body between the trigger
  // firing and the cron reading the row.
  const { data: tplRows } = await sb
    .from('beithady_pre_arrival_templates')
    .select('building_code, body, enabled, hours_before, approved_at, approved_body')
    .eq('enabled', true)
    .not('approved_at', 'is', null);
  const tpls = new Map<string | 'fallback', { body: string; hours_before: number }>();
  for (const t of (tplRows as Array<{
    building_code: string | null; body: string; hours_before: number;
    approved_at: string | null; approved_body: string | null;
  }> | null) || []) {
    if (!t.approved_at || t.body !== t.approved_body) continue;
    const k = t.building_code === null ? 'fallback' : t.building_code;
    tpls.set(k, { body: t.body, hours_before: t.hours_before });
  }

  for (const r of arrivals) {
    if (!r.id) { skipped++; continue; }
    // Match guest
    const guest = await matchBeithadyGuest(r.guest_email, r.guest_phone);
    if (!guest || !guest.phone_e164) { skipped++; continue; }
    // Check idempotency
    const { data: existing } = await sb
      .from('beithady_pre_arrival_messages')
      .select('id')
      .eq('reservation_id', r.id)
      .eq('template_used', 'main')
      .maybeSingle();
    if (existing) { skipped++; continue; }

    const tpl = (r.building_code && tpls.get(r.building_code)) || tpls.get('fallback');
    if (!tpl) { skipped++; continue; }

    const body = templateRender(tpl.body, {
      guest_name: (guest.full_name || r.guest_name || 'there').split(' ')[0],
      listing: r.listing_nickname || 'your apartment',
      check_in: r.check_in_date || 'tomorrow',
      host_phone: HOST_PHONE_DEFAULT,
    });

    // Ensure wa_casual conversation exists (RPC from Phase C.3 migration)
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
      mode: 'automatic',
    });

    if (result.ok) {
      await sb.from('beithady_pre_arrival_messages').insert({
        reservation_id: r.id,
        guest_id: guest.id,
        building_code: r.building_code,
        template_used: 'main',
        message_id: result.messageId,
        scheduled_for: new Date().toISOString(),
        sent_at: new Date().toISOString(),
      });
      sent++;
    } else {
      errors.push({ reservation_id: r.id, error: result.error });
      await sb.from('beithady_pre_arrival_messages').insert({
        reservation_id: r.id,
        guest_id: guest.id,
        building_code: r.building_code,
        template_used: 'main',
        scheduled_for: new Date().toISOString(),
        error: result.error,
      });
    }
  }

  await recordAudit({
    module: 'communication',
    action: 'pre_arrival_dispatch_run',
    metadata: { considered: arrivals.length, sent, skipped, error_count: errors.length },
  });

  return { considered: arrivals.length, sent, skipped, errors };
}
