import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWaCasualMessage } from '@/lib/beithady/communication/send-wa-casual';
import { recordAudit } from '@/lib/beithady/audit';
import { getRecentCheckouts, matchBeithadyGuest, mintToken } from './reservation-helpers';

const PUBLIC_BASE = process.env.NEXT_PUBLIC_APP_URL || 'https://limeinc.vercel.app';

export async function runCsatDispatch(): Promise<{
  considered: number;
  sent: number;
  skipped: number;
  errors: Array<{ reservation_id: string; error: string }>;
}> {
  const sb = supabaseAdmin();
  // Window: check-out was 12-30h ago
  const checkouts = await getRecentCheckouts(12, 30);
  let sent = 0;
  let skipped = 0;
  const errors: Array<{ reservation_id: string; error: string }> = [];

  for (const r of checkouts) {
    if (!r.id) { skipped++; continue; }
    const guest = await matchBeithadyGuest(r.guest_email, r.guest_phone);
    if (!guest || !guest.phone_e164) { skipped++; continue; }
    // Idempotency
    const { data: existing } = await sb
      .from('beithady_csat_responses')
      .select('id')
      .eq('reservation_id', r.id)
      .maybeSingle();
    if (existing) { skipped++; continue; }

    const token = mintToken(24);
    const expiresAt = new Date(Date.now() + 14 * 86400e3).toISOString();
    const url = `${PUBLIC_BASE}/r/beithady/csat/${token}`;
    const firstName = (guest.full_name || r.guest_name || 'there').split(' ')[0];
    const body = `Hi ${firstName},\n\nThank you for staying with Beit Hady at ${r.listing_nickname || 'our apartment'}!\n\nQuick favour — how likely are you to recommend us to a friend? It takes 30 seconds:\n\n${url}\n\nWe read every response.\n\nBeit Hady team`;

    // Ensure wa_casual conversation
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

    if (result.ok) {
      await sb.from('beithady_csat_responses').insert({
        reservation_id: r.id,
        guest_id: guest.id,
        building_code: r.building_code,
        token,
        message_id: result.messageId,
        asked_at: new Date().toISOString(),
        expires_at: expiresAt,
      });
      sent++;
    } else {
      errors.push({ reservation_id: r.id, error: result.error });
    }
  }

  await recordAudit({
    module: 'communication',
    action: 'csat_dispatch_run',
    metadata: { considered: checkouts.length, sent, skipped, error_count: errors.length },
  });

  return { considered: checkouts.length, sent, skipped, errors };
}

// Public response handler — called from /r/beithady/csat/[token]/page.tsx
export async function recordCsatResponse(
  token: string,
  nps: number,
  comment: string
): Promise<{ ok: true; needs_followup: boolean; reservation_id: string } | { ok: false; error: string }> {
  if (nps < 0 || nps > 10) return { ok: false, error: 'invalid_nps' };
  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('beithady_csat_responses')
    .select('id, reservation_id, guest_id, building_code, expires_at, responded_at')
    .eq('token', token)
    .maybeSingle();
  if (!row) return { ok: false, error: 'token_not_found' };
  const r = row as { id: string; reservation_id: string; guest_id: string | null; building_code: string | null; expires_at: string; responded_at: string | null };
  if (new Date(r.expires_at).getTime() < Date.now()) return { ok: false, error: 'expired' };
  if (r.responded_at) return { ok: false, error: 'already_responded' };

  const needsFollowup = nps < 8;
  const sentiment = nps >= 9 ? 'promoter' : nps >= 7 ? 'passive' : 'detractor';

  await sb.from('beithady_csat_responses').update({
    responded_at: new Date().toISOString(),
    nps,
    comment: comment?.slice(0, 2000) || null,
    ai_sentiment: sentiment,
    needs_followup: needsFollowup,
  }).eq('id', r.id);

  // Auto-task for NPS < 8
  if (needsFollowup) {
    const { data: task } = await sb.from('beithady_tasks').insert({
      guest_id: r.guest_id,
      reservation_id: r.reservation_id,
      building_code: r.building_code,
      type: 'csat_followup',
      title: `CSAT follow-up — NPS ${nps}/10`,
      notes: comment ? comment.slice(0, 500) : null,
      due_at: new Date(Date.now() + 24 * 3600e3).toISOString(),
      priority: nps <= 5 ? 'urgent' : 'high',
      metadata: { nps, sentiment },
    }).select('id').single();
    if (task) {
      await sb.from('beithady_csat_responses').update({
        followup_task_id: (task as { id: string }).id,
      }).eq('id', r.id);
    }
  }

  await recordAudit({
    module: 'communication',
    action: 'csat_response_received',
    target_type: 'reservation',
    target_id: r.reservation_id,
    metadata: { nps, sentiment, needs_followup: needsFollowup },
  });

  return { ok: true, needs_followup: needsFollowup, reservation_id: r.reservation_id };
}
