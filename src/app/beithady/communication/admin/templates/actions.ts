'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';

const ADMIN_TEMPLATES_PATH = '/beithady/communication/admin/templates';

async function ensureFullPerm(): Promise<{ id: string; username: string }> {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const allowed =
    user.is_admin || (await hasBeithadyPermission(user, 'communication', 'full'));
  if (!allowed) throw new Error('forbidden');
  return { id: user.id, username: user.username };
}

function parseChannelArr(formData: FormData): string[] {
  const out: string[] = [];
  for (const c of ['guesty', 'wa_cloud', 'wa_casual']) {
    if (formData.get(`channel_${c}`) === 'on') out.push(c);
  }
  return out;
}

function parseSourceArr(formData: FormData): string[] {
  const raw = String(formData.get('source_filter') || '').trim();
  if (!raw) return [];
  return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

export async function createTemplateAction(formData: FormData): Promise<void> {
  const user = await ensureFullPerm();
  const name = String(formData.get('name') || '').trim();
  const language = String(formData.get('language') || 'en').trim();
  const category = String(formData.get('category') || 'general').trim();
  const body = String(formData.get('body') || '').trim();
  const sortOrder = parseInt(String(formData.get('sort_order') || '100'), 10) || 100;
  if (!name || !body) throw new Error('name_and_body_required');

  const sb = supabaseAdmin();
  const { data: ins } = await sb
    .from('beithady_message_templates')
    .insert({
      name,
      channel: parseChannelArr(formData),
      source_filter: parseSourceArr(formData),
      language,
      category,
      body,
      sort_order: sortOrder,
      active: formData.get('active') === 'on',
      created_by_user_id: user.id,
    })
    .select('id')
    .single();

  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'template_created',
    target_type: 'template',
    target_id: (ins as { id: string } | null)?.id || undefined,
    after: { name, language, category, sort_order: sortOrder },
  });

  revalidatePath(ADMIN_TEMPLATES_PATH);
  redirect(ADMIN_TEMPLATES_PATH);
}

export async function updateTemplateAction(formData: FormData): Promise<void> {
  const user = await ensureFullPerm();
  const id = String(formData.get('id') || '').trim();
  if (!id) throw new Error('missing_id');
  const name = String(formData.get('name') || '').trim();
  const language = String(formData.get('language') || 'en').trim();
  const category = String(formData.get('category') || 'general').trim();
  const body = String(formData.get('body') || '').trim();
  const sortOrder = parseInt(String(formData.get('sort_order') || '100'), 10) || 100;
  if (!name || !body) throw new Error('name_and_body_required');

  const sb = supabaseAdmin();
  await sb
    .from('beithady_message_templates')
    .update({
      name,
      channel: parseChannelArr(formData),
      source_filter: parseSourceArr(formData),
      language,
      category,
      body,
      sort_order: sortOrder,
      active: formData.get('active') === 'on',
    })
    .eq('id', id);

  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'template_updated',
    target_type: 'template',
    target_id: id,
    after: { name, language, category, sort_order: sortOrder },
  });

  revalidatePath(ADMIN_TEMPLATES_PATH);
  redirect(ADMIN_TEMPLATES_PATH);
}

export async function deleteTemplateAction(formData: FormData): Promise<void> {
  const user = await ensureFullPerm();
  const id = String(formData.get('id') || '').trim();
  if (!id) throw new Error('missing_id');
  const sb = supabaseAdmin();
  await sb.from('beithady_message_templates').delete().eq('id', id);
  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: 'template_deleted',
    target_type: 'template',
    target_id: id,
  });
  revalidatePath(ADMIN_TEMPLATES_PATH);
  redirect(ADMIN_TEMPLATES_PATH);
}

export async function toggleTemplateActiveAction(formData: FormData): Promise<void> {
  const user = await ensureFullPerm();
  const id = String(formData.get('id') || '').trim();
  const active = formData.get('next') === 'on';
  if (!id) throw new Error('missing_id');
  const sb = supabaseAdmin();
  await sb.from('beithady_message_templates').update({ active }).eq('id', id);
  await recordAudit({
    actor_user_id: user.id,
    module: 'communication',
    action: active ? 'template_activated' : 'template_deactivated',
    target_type: 'template',
    target_id: id,
  });
  revalidatePath(ADMIN_TEMPLATES_PATH);
}
