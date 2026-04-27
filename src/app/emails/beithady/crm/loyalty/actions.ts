'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { runLoyaltyTick } from '@/lib/beithady/engagement/loyalty-tick';
import { recordAudit } from '@/lib/beithady/audit';

export async function runLoyaltyTickAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'crm', 'full'));
  if (!allowed) throw new Error('forbidden');
  const result = await runLoyaltyTick();
  await recordAudit({
    actor_user_id: user.id,
    module: 'crm',
    action: 'loyalty_tick_manual',
    metadata: result as unknown as Record<string, unknown>,
  });
  revalidatePath('/emails/beithady/crm/loyalty');
  revalidatePath('/emails/beithady/crm');
}
