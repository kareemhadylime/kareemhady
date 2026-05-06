import { supabaseAdmin } from '@/lib/supabase';
import { getRecentCorrectionsByCategory } from './corrections';
import type { CategorySlug, ClassificationMethod, PersonalEmailRule } from './types';

export async function loadActiveRules(): Promise<PersonalEmailRule[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('personal_email_rules')
    .select('*')
    .eq('enabled', true)
    .order('priority', { ascending: true });
  if (error) throw new Error(`load_rules_failed: ${error.message}`);
  return (data ?? []) as PersonalEmailRule[];
}

export async function persistClassification(args: {
  emailLogId: string;
  category: CategorySlug;
  confidence: number | null;
  method: ClassificationMethod;
  reason: string;
  needs_review: boolean;
}): Promise<void> {
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('email_logs')
    .update({
      category: args.category,
      category_confidence: args.confidence,
      category_method: args.method,
      category_reason: args.reason,
      needs_review: args.needs_review,
      last_classified_at: new Date().toISOString(),
    })
    .eq('id', args.emailLogId);
  if (error) throw new Error(`persist_classification_failed: ${error.message}`);
}

export { getRecentCorrectionsByCategory as loadCorrectionsForFewShot };
