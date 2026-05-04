'use server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { ingestPersonalEmails } from '@/lib/personal-email/ingest';

async function requireAdmin() {
  const u = await getCurrentUser();
  if (!u || !u.is_admin) throw new Error('forbidden');
}

// Structured result returned to the UI via useActionState — gives the
// client form pending state + a final summary instead of a silent
// long-running submit.
export type RecomputeResult = {
  ok: boolean;
  fromIso: string;
  toIso: string;
  emailsCleared: number;
  durationMs: number;
  ingestStarted: boolean;
  ingestRunId: string | null;
  ingestError: string | null;
  topLevelError?: string;
};

// Clears `category` for personal-domain email_logs in the given date
// range and re-runs the ingest pipeline (which re-classifies anything
// missing a category). Now matches React 19 useActionState signature
// — receives prev state (ignored) + FormData and returns the new
// structured result.
export async function recomputeRange(
  _prev: RecomputeResult | null,
  formData: FormData,
): Promise<RecomputeResult> {
  const startMs = Date.now();
  const fromIso = String(formData.get('from_iso') ?? '');
  const toIso = String(formData.get('to_iso') ?? '');

  const result: RecomputeResult = {
    ok: false,
    fromIso,
    toIso,
    emailsCleared: 0,
    durationMs: 0,
    ingestStarted: false,
    ingestRunId: null,
    ingestError: null,
  };

  try {
    await requireAdmin();
  } catch (e: any) {
    result.topLevelError = `auth: ${String(e?.message ?? e).slice(0, 100)}`;
    result.durationMs = Date.now() - startMs;
    return result;
  }

  if (!fromIso || !toIso) {
    result.topLevelError = 'missing_range — both From and To are required';
    result.durationMs = Date.now() - startMs;
    return result;
  }

  const sb = supabaseAdmin();
  // Find personal-domain email_logs ids in range, then null out their classification.
  const { data: ids, error: queryErr } = await sb
    .from('email_logs')
    .select('id, accounts!inner(domain)')
    .eq('accounts.domain', 'personal')
    .gte('received_at', fromIso)
    .lte('received_at', toIso);
  if (queryErr) {
    result.topLevelError = `query_failed: ${queryErr.message.slice(0, 120)}`;
    result.durationMs = Date.now() - startMs;
    return result;
  }
  const idList = ((ids ?? []) as any[]).map(r => r.id);
  if (idList.length) {
    const { error: upErr } = await sb.from('email_logs').update({
      category: null, category_method: null, category_confidence: null,
      category_reason: null, last_classified_at: null, needs_review: false,
    }).in('id', idList);
    if (upErr) {
      result.topLevelError = `clear_failed: ${upErr.message.slice(0, 120)}`;
      result.durationMs = Date.now() - startMs;
      return result;
    }
  }
  result.emailsCleared = idList.length;

  // Re-ingest immediately so the user sees fresh classifications without
  // waiting 15 min for the next cron tick. Non-fatal if it fails — the
  // cron will pick up.
  try {
    const { runId } = await ingestPersonalEmails({ trigger: 'manual' });
    result.ingestStarted = true;
    result.ingestRunId = runId;
  } catch (e: any) {
    result.ingestError = String(e?.message ?? e).slice(0, 200);
  }

  result.ok = !result.topLevelError;
  result.durationMs = Date.now() - startMs;

  revalidatePath('/personal/email/setup/ai');
  revalidatePath('/personal/email');
  return result;
}
