'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import type { BriefRole } from '@/lib/beithady/morning-brief/types';

export async function addBriefExtraAction(input: {
  role: BriefRole;
  label: string;
  email?: string;
  whatsapp?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireBeithadyPermission('operations', 'full');
  if (!input.label.trim()) return { ok: false, error: 'Label required' };
  if (!input.email && !input.whatsapp) return { ok: false, error: 'Email or WhatsApp required' };
  const sb = supabaseAdmin();
  const { error } = await sb.from('beithady_morning_brief_extras').insert({
    role: input.role,
    label: input.label.trim(),
    email: input.email?.trim() || null,
    whatsapp: input.whatsapp?.replace(/[^\d]/g, '') || null,
    created_by_user_id: user.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath('/emails/beithady/operations/morning-brief/recipients');
  return { ok: true };
}

export async function deleteBriefExtraAction(input: {
  id: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireBeithadyPermission('operations', 'full');
  const sb = supabaseAdmin();
  const { error } = await sb.from('beithady_morning_brief_extras').delete().eq('id', input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/emails/beithady/operations/morning-brief/recipients');
  return { ok: true };
}

export async function toggleBriefExtraAction(input: {
  id: string;
  enabled: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  await requireBeithadyPermission('operations', 'full');
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('beithady_morning_brief_extras')
    .update({ enabled: input.enabled, updated_at: new Date().toISOString() })
    .eq('id', input.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/emails/beithady/operations/morning-brief/recipients');
  return { ok: true };
}
