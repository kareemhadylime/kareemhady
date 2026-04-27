'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { recordAudit } from '@/lib/beithady/audit';
import { recomputeSignals, runCountryBackfill } from '@/lib/beithady/market/signals';

export async function recomputeAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'analytics', 'full'));
  if (!allowed) throw new Error('forbidden');
  const n = await recomputeSignals();
  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'market_signals_recomputed',
    metadata: { signals_count: n },
  });
  revalidatePath('/emails/beithady/analytics/market-intel');
}

export async function runBackfillAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'analytics', 'full'));
  if (!allowed) throw new Error('forbidden');
  const result = await runCountryBackfill();
  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'country_backfill_run',
    metadata: result as unknown as Record<string, unknown>,
  });
  revalidatePath('/emails/beithady/analytics/market-intel');
  revalidatePath('/emails/beithady/crm');
}
