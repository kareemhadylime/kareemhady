'use server';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { recordAudit } from '@/lib/beithady/audit';
import { createLead, updateLeadStage, LEAD_STAGES, type LeadStage } from '@/lib/beithady/pipeline/leads';

export async function updateLeadStageAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'crm', 'full'));
  if (!allowed) throw new Error('forbidden');

  const id = String(formData.get('lead_id') || '').trim();
  const stage = String(formData.get('stage') || '') as LeadStage;
  const lostReason = String(formData.get('lost_reason') || '').trim() || undefined;
  if (!id) throw new Error('missing_lead_id');
  if (!(LEAD_STAGES as readonly string[]).includes(stage)) throw new Error('invalid_stage');

  await updateLeadStage(id, stage, lostReason);
  await recordAudit({
    actor_user_id: user.id,
    module: 'crm',
    action: 'lead_stage_changed',
    target_type: 'lead',
    target_id: id,
    after: { stage, lost_reason: lostReason || null },
  });
  revalidatePath('/beithady/crm/pipeline');
}

export async function createManualLeadAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'crm', 'full'));
  if (!allowed) throw new Error('forbidden');

  const fullName = String(formData.get('full_name') || '').trim() || null;
  const email = String(formData.get('email') || '').trim() || null;
  const phone = String(formData.get('phone') || '').trim() || null;
  const buildingInterest = String(formData.get('building_interest') || '').trim() || null;
  const message = String(formData.get('message') || '').trim() || null;

  if (!email && !phone) {
    revalidatePath('/beithady/crm/pipeline');
    return;
  }

  const result = await createLead({
    source: 'manual',
    full_name: fullName,
    email,
    phone,
    message,
    building_interest: buildingInterest,
  });

  if (result.ok) {
    await recordAudit({
      actor_user_id: user.id,
      module: 'crm',
      action: 'lead_created_manual',
      target_type: 'lead',
      target_id: result.lead_id,
    });
  }
  revalidatePath('/beithady/crm/pipeline');
}
