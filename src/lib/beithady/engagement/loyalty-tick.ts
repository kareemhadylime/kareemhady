import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { sendWaCasualMessage } from '@/lib/beithady/communication/send-wa-casual';
import { recordAudit } from '@/lib/beithady/audit';
import { isAutomationPaused } from '@/lib/beithady/automations';
import { getMessageTemplate } from './loyalty-config';
import { templateRender } from './reservation-helpers';

// Daily loyalty tier tick:
// 1. Recompute tier for every guest based on lifetime_stays (delegates
//    to beithady_loyalty_recompute() RPC from the migration).
// 2. Sync VIP flag for platinum (delegates to beithady_loyalty_sync_vip).
// 3. For guests whose tier was just promoted (today), send the
//    tier-specific congrats template.

export async function runLoyaltyTick(): Promise<{
  promoted: number;
  vip_synced: number;
  congrats_sent: number;
  by_tier: Record<string, unknown>;
  paused?: boolean;
}> {
  if (await isAutomationPaused('loyalty_notifications')) {
    return { promoted: 0, vip_synced: 0, congrats_sent: 0, by_tier: {}, paused: true };
  }
  const sb = supabaseAdmin();

  // 1. Capture pre-state so we know who got promoted
  const { data: before } = await sb
    .from('beithady_guests')
    .select('id, loyalty_tier');
  const beforeMap = new Map<string, string>();
  for (const g of (before as Array<{ id: string; loyalty_tier: string }> | null) || []) {
    beforeMap.set(g.id, g.loyalty_tier);
  }

  // 2. Recompute
  const { data: recompute } = await sb.rpc('beithady_loyalty_recompute');
  const recomputeRow = (Array.isArray(recompute) ? recompute[0] : recompute) as
    | { promoted_count: number; by_tier: Record<string, unknown> }
    | undefined;
  const promoted = recomputeRow?.promoted_count || 0;
  const byTier = (recomputeRow?.by_tier as Record<string, unknown>) || {};

  // 3. VIP sync
  const { data: vipResult } = await sb.rpc('beithady_loyalty_sync_vip');
  const vipSynced = Number(vipResult) || 0;

  // 4. Find newly-promoted guests (compare to beforeMap) and send
  //    congrats template
  const { data: after } = await sb
    .from('beithady_guests')
    .select('id, full_name, phone_e164, loyalty_tier');
  let congratsSent = 0;
  const promotedGuests: Array<{ id: string; full_name: string | null; phone_e164: string | null; loyalty_tier: string }> = [];
  for (const g of (after as Array<{ id: string; full_name: string | null; phone_e164: string | null; loyalty_tier: string }> | null) || []) {
    const wasTier = beforeMap.get(g.id) || 'none';
    if (wasTier !== g.loyalty_tier && rankOf(g.loyalty_tier) > rankOf(wasTier)) {
      promotedGuests.push(g);
    }
  }

  for (const g of promotedGuests) {
    if (!g.phone_e164) continue;
    const tpl = await getMessageTemplate(g.loyalty_tier as Parameters<typeof getMessageTemplate>[0]);
    if (!tpl) continue;
    const body = templateRender(tpl, {
      guest_name: (g.full_name || 'there').split(' ')[0],
    });

    // Ensure conversation exists
    const { data: convId } = await sb.rpc('beithady_ensure_wa_casual_conversation', {
      p_phone_digits: g.phone_e164.replace(/[^0-9]/g, ''),
      p_guest_name: g.full_name,
    });
    if (!convId) continue;

    const r = await sendWaCasualMessage({
      beithadyConversationId: convId as string,
      body,
      agentUserId: null,
      agentDisplayName: 'Beit Hady automated',
      mode: 'automatic',
    });
    if (r.ok) congratsSent++;
  }

  await recordAudit({
    module: 'communication',
    action: 'loyalty_tick_run',
    metadata: { promoted, vip_synced: vipSynced, congrats_sent: congratsSent, by_tier: byTier },
  });

  return { promoted, vip_synced: vipSynced, congrats_sent: congratsSent, by_tier: byTier };
}

function rankOf(tier: string): number {
  switch (tier) {
    case 'platinum': return 4;
    case 'gold': return 3;
    case 'silver': return 2;
    case 'bronze': return 1;
    default: return 0;
  }
}
