'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { setSetting } from '@/lib/beithady/settings';

export async function saveAiConfigAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'settings', 'full'));
  if (!allowed) throw new Error('forbidden');

  const raw = Number(formData.get('confidence_threshold'));
  const threshold = Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.85;
  const autoEnabled = formData.get('auto_reply_enabled') !== null;
  const vipDigest = formData.get('vip_digest_enabled') !== null;

  await Promise.all([
    setSetting('ai_confidence_threshold', threshold, { actorUserId: user.id }),
    setSetting('ai_auto_reply_enabled', autoEnabled, { actorUserId: user.id }),
    setSetting('vip_digest_enabled', vipDigest, { actorUserId: user.id }),
  ]);

  revalidatePath('/emails/beithady/settings/ai-config');
}
