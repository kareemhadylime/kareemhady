'use server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { recordAudit } from '@/lib/beithady/audit';

export async function completeTaskAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'crm', 'full'));
  if (!allowed) throw new Error('forbidden');
  const id = String(formData.get('task_id') || '').trim();
  if (!id) throw new Error('missing_task_id');

  const sb = supabaseAdmin();
  await sb.from('beithady_tasks').update({
    status: 'done',
    completed_at: new Date().toISOString(),
    completed_by_user_id: user.id,
  }).eq('id', id);

  await recordAudit({
    actor_user_id: user.id,
    module: 'crm',
    action: 'task_completed',
    target_type: 'task',
    target_id: id,
  });
  revalidatePath('/beithady/crm/tasks');
}

export async function snoozeTaskAction(formData: FormData): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed = user.is_admin || (await hasBeithadyPermission(user, 'crm', 'full'));
  if (!allowed) throw new Error('forbidden');
  const id = String(formData.get('task_id') || '').trim();
  if (!id) throw new Error('missing_task_id');

  const sb = supabaseAdmin();
  await sb.from('beithady_tasks').update({
    due_at: new Date(Date.now() + 24 * 3600e3).toISOString(),
  }).eq('id', id).eq('status', 'open');

  await recordAudit({
    actor_user_id: user.id,
    module: 'crm',
    action: 'task_snoozed',
    target_type: 'task',
    target_id: id,
    metadata: { snooze_hours: 24 },
  });
  revalidatePath('/beithady/crm/tasks');
}
