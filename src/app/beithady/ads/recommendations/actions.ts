'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { applyMetaRecommendation } from '@/lib/beithady/ads/meta-recommendation-appliers';
import { recordAudit } from '@/lib/beithady/audit';

export async function applyRecommendationAction(formData: FormData): Promise<void> {
  const { user } = await requireBeithadyPermission('ads', 'full');
  const type = String(formData.get('type') || '').trim().toUpperCase();
  if (!type) {
    redirect('/beithady/ads/recommendations?error=missing_type');
  }

  const result = await applyMetaRecommendation(type);

  await recordAudit({
    actor_user_id: user.id,
    module: 'ads',
    action: result.ok ? 'recommendation_applied' : 'recommendation_apply_failed',
    metadata: { type, ok: result.ok, ...(result.ok ? { applied: result.applied, details: result.details } : { reason: result.reason, manualOnly: result.manualOnly }) },
  });

  revalidatePath('/beithady/ads/recommendations');
  if (result.ok) {
    redirect(`/beithady/ads/recommendations?applied=${encodeURIComponent(type)}&msg=${encodeURIComponent(result.details || 'Applied')}`);
  } else {
    const prefix = result.manualOnly ? 'manual' : 'error';
    redirect(`/beithady/ads/recommendations?${prefix}=${encodeURIComponent(type)}&reason=${encodeURIComponent(result.reason)}`);
  }
}
