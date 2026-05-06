import { supabaseAdmin } from '@/lib/supabase';
import type { CategorySlug } from './types';
import { CATEGORIES } from './categories';

export type CorrectionExample = {
  category: CategorySlug;
  fromAddress: string;
  subject: string;
};

// Fetch the N most-recent user corrections per category. Used as
// few-shot examples in the AI classification system prompt (spec §12).
export async function getRecentCorrectionsByCategory(
  perCategory = 10,
): Promise<Record<CategorySlug, CorrectionExample[]>> {
  const sb = supabaseAdmin();
  const out: Record<string, CorrectionExample[]> = {};
  for (const cat of CATEGORIES) {
    out[cat.slug] = [];
  }
  // Single round-trip: fetch the latest corrections + their email_log
  // headers. Postgres distinct-on per category would be cleaner but
  // small N keeps this readable.
  const { data, error } = await sb
    .from('personal_email_corrections')
    .select('new_category, email_logs(from_address, subject)')
    .order('created_at', { ascending: false })
    .limit(perCategory * CATEGORIES.length);
  if (error) throw new Error(`corrections_query_failed: ${error.message}`);
  for (const row of (data as any[]) ?? []) {
    const cat = row.new_category as CategorySlug;
    if (!out[cat]) out[cat] = [];
    if (out[cat].length >= perCategory) continue;
    out[cat].push({
      category: cat,
      fromAddress: row.email_logs?.from_address ?? '',
      subject: row.email_logs?.subject ?? '',
    });
  }
  return out as Record<CategorySlug, CorrectionExample[]>;
}
