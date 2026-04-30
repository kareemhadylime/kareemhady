'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import {
  setManualOutboundPaused,
  setAutomationPaused,
  AUTOMATION_REGISTRY,
  type AutomationKey,
} from '@/lib/beithady/automations';

// Phase C.5 follow-up — Settings → Outbound kill switches.
// Toggle a single flag (manual or one specific automation). Audited via
// setSetting → recordAudit. Page revalidates on each flip.

export async function toggleOutboundFlagAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  // Admin-only — outbound switches affect production messaging.
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'settings', 'full'));
  if (!allowed) throw new Error('forbidden');

  const target = String(formData.get('target') || '').trim();
  const next = formData.get('next') === 'on';

  if (target === 'manual') {
    await setManualOutboundPaused(next, user.id);
  } else if (target in AUTOMATION_REGISTRY) {
    await setAutomationPaused(target as AutomationKey, next, user.id);
  } else {
    throw new Error(`unknown_target:${target}`);
  }

  revalidatePath('/beithady/settings/outbound');
}
