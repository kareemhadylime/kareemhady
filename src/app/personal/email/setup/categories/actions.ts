'use server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';

async function requireAdmin() {
  const u = await getCurrentUser();
  if (!u || !u.is_admin) throw new Error('forbidden');
}

export async function updateCategory(slug: string, formData: FormData): Promise<void> {
  await requireAdmin();
  const patch = {
    display_name: String(formData.get('display_name') ?? '').trim(),
    gmail_label_name: String(formData.get('gmail_label_name') ?? '').trim(),
    is_enabled: formData.get('is_enabled') === 'on',
    updated_at: new Date().toISOString(),
  };
  await supabaseAdmin().from('personal_email_categories').update(patch).eq('slug', slug);
  revalidatePath('/personal/email/setup/categories');
}
