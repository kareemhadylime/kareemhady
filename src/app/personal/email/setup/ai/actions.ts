'use server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { ingestPersonalEmails } from '@/lib/personal-email/ingest';

async function requireAdmin() {
  const u = await getCurrentUser();
  if (!u || !u.is_admin) throw new Error('forbidden');
}

// Clears `category` for personal-domain email_logs in the given date
// range and re-runs the ingest pipeline (which re-classifies anything
// missing a category).
export async function recomputeRange(formData: FormData): Promise<void> {
  await requireAdmin();
  const fromIso = String(formData.get('from_iso') ?? '');
  const toIso = String(formData.get('to_iso') ?? '');
  if (!fromIso || !toIso) throw new Error('missing_range');
  const sb = supabaseAdmin();
  // Find personal-domain email_logs ids in range, then null out their classification.
  const { data: ids } = await sb
    .from('email_logs')
    .select('id, accounts!inner(domain)')
    .eq('accounts.domain', 'personal')
    .gte('received_at', fromIso)
    .lte('received_at', toIso);
  const idList = ((ids ?? []) as any[]).map(r => r.id);
  if (idList.length) {
    await sb.from('email_logs').update({
      category: null, category_method: null, category_confidence: null,
      category_reason: null, last_classified_at: null, needs_review: false,
    }).in('id', idList);
  }
  await ingestPersonalEmails({ trigger: 'manual' });
  revalidatePath('/personal/email/setup/ai');
}
