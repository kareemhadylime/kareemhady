// @ts-nocheck — v1 orphan; route gets rewritten in Tasks 17-39 of fmplus-budget-v2 plan
'use server';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

export async function updateThresholdsAction(args: { green_pct: number; amber_pct: number }): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user || !user.is_admin) return { ok: false, error: 'Admin only.' };
  if (args.green_pct < 0 || args.amber_pct <= args.green_pct) {
    return { ok: false, error: 'Amber threshold must be greater than green threshold.' };
  }
  const sb = supabaseAdmin();
  const { error } = await sb.from('budget_settings')
    .update({ green_pct: args.green_pct, amber_pct: args.amber_pct, updated_at: new Date().toISOString() })
    .eq('id', 1);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/fmplus/financial/budget', 'layout');
  return { ok: true };
}
