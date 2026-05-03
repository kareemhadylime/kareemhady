import { supabaseAdmin } from '@/lib/supabase';
import { CATEGORIES } from './categories';
import type { CategorySlug } from './types';

export async function upsertLabelMapping(
  accountId: string, categorySlug: CategorySlug, gmailLabelId: string,
): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('personal_email_account_labels')
    .upsert({ account_id: accountId, category_slug: categorySlug, gmail_label_id: gmailLabelId },
            { onConflict: 'account_id,category_slug' });
  if (error) throw new Error(`upsert_label_failed: ${error.message}`);
}

export async function loadLabelMap(
  accountId: string,
): Promise<Partial<Record<CategorySlug, string>>> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('personal_email_account_labels')
    .select('category_slug, gmail_label_id')
    .eq('account_id', accountId);
  if (error) throw new Error(`load_label_map_failed: ${error.message}`);
  const out: Partial<Record<CategorySlug, string>> = {};
  for (const r of (data ?? []) as any[]) {
    out[r.category_slug as CategorySlug] = r.gmail_label_id;
  }
  return out;
}

export const ALL_LIME_LABEL_NAMES = CATEGORIES.map(c => c.gmailLabelName);
