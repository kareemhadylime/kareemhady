'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { CategorySlug, MatchType } from '@/lib/personal-email/schema';

async function requireAdmin() {
  const u = await getCurrentUser();
  if (!u || !u.is_admin) throw new Error('forbidden');
}

export async function saveRule(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get('id') as string | null;
  const rule = {
    priority: Number(formData.get('priority') ?? 100),
    name: String(formData.get('name') ?? '').trim(),
    account_id: (formData.get('account_id') as string) || null,
    match_type: MatchType.parse(formData.get('match_type')),
    match_value: String(formData.get('match_value') ?? '').trim(),
    target_category: CategorySlug.parse(formData.get('target_category')),
    enabled: formData.get('enabled') === 'on',
  };
  const sb = supabaseAdmin();
  if (id) {
    await sb.from('personal_email_rules').update(rule).eq('id', id);
  } else {
    await sb.from('personal_email_rules').insert(rule);
  }
  revalidatePath('/personal/email/setup/rules');
  redirect('/personal/email/setup/rules');
}

export async function deleteRule(id: string): Promise<void> {
  await requireAdmin();
  await supabaseAdmin().from('personal_email_rules').delete().eq('id', id);
  revalidatePath('/personal/email/setup/rules');
}

export async function toggleRule(id: string, enabled: boolean): Promise<void> {
  await requireAdmin();
  await supabaseAdmin().from('personal_email_rules').update({ enabled }).eq('id', id);
  revalidatePath('/personal/email/setup/rules');
}
