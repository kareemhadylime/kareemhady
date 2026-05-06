'use server';
import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { ingestPersonalEmails } from '@/lib/personal-email/ingest';
import { matchRule } from '@/lib/personal-email/rule-matcher';
import { parseFromAddress, parseFromDomain } from '@/lib/personal-email/feature-extractor';
import { ALWAYS_AI_CATEGORIES } from '@/lib/personal-email/categories';
import type { CategorySlug, EmailFeatures, PersonalEmailRule } from '@/lib/personal-email/types';

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

export type ReshuffleResult = {
  ok: boolean;
  scanned: number;
  movedByRule: number;
  unchanged: number;
  manualKept: number;
  durationMs: number;
  topLevelError?: string;
};

// Forces a re-evaluation of every personal email_log against the
// CURRENT rule set, using only cached features (from_address, to_address,
// subject, body_excerpt, label_ids — no Gmail API call, no AI). Rows
// with category_method='manual' are left alone (user moved them
// deliberately). Rows whose rule outcome lands in ALWAYS_AI_CATEGORIES
// (action_required, personal) are also left alone — rules are heuristic
// for those tiers and the AI's previous verdict is more trustworthy
// than re-rolling without re-running the AI.
//
// Use this after editing rules (e.g. migration 0092) to "reshuffle all
// boxes" without paying for a full re-ingest + re-AI pass.
export async function reshuffleAll(): Promise<ReshuffleResult> {
  const startMs = Date.now();
  const result: ReshuffleResult = {
    ok: false, scanned: 0, movedByRule: 0, unchanged: 0, manualKept: 0,
    durationMs: 0,
  };

  try {
    await requireAdmin();
  } catch (e: any) {
    result.topLevelError = `auth: ${String(e?.message ?? e).slice(0, 100)}`;
    result.durationMs = Date.now() - startMs;
    return result;
  }

  const sb = supabaseAdmin();

  // Load all active rules once.
  const { data: ruleRows, error: rulesErr } = await sb
    .from('personal_email_rules')
    .select('id, priority, name, account_id, match_type, match_value, target_category, enabled')
    .eq('enabled', true)
    .order('priority', { ascending: true });
  if (rulesErr) {
    result.topLevelError = `load_rules_failed: ${rulesErr.message.slice(0, 120)}`;
    result.durationMs = Date.now() - startMs;
    return result;
  }
  const rules = (ruleRows ?? []) as PersonalEmailRule[];

  // Load every personal-domain email_log with cached features. Pull
  // account email so owner-relative rules and account scoping work.
  const { data: rows, error: rowsErr } = await sb
    .from('email_logs')
    .select('id, account_id, gmail_message_id, from_address, to_address, subject, body_excerpt, label_ids, category, category_method, accounts!inner(email, domain)')
    .eq('accounts.domain', 'personal');
  if (rowsErr) {
    result.topLevelError = `load_rows_failed: ${rowsErr.message.slice(0, 120)}`;
    result.durationMs = Date.now() - startMs;
    return result;
  }

  for (const r of (rows ?? []) as any[]) {
    result.scanned += 1;

    if (r.category_method === 'manual') {
      result.manualKept += 1;
      continue;
    }

    const fromHeader = (r.from_address ?? '') as string;
    const toHeader = (r.to_address ?? '') as string;
    const features: EmailFeatures = {
      fromAddress: parseFromAddress(fromHeader),
      fromDomain: parseFromDomain(fromHeader),
      toAddress: toHeader.toLowerCase(),
      subject: (r.subject ?? '') as string,
      hasListUnsubscribe: false,            // not cached on email_logs
      gmailLabelIds: Array.isArray(r.label_ids) ? r.label_ids : [],
      gmailLabelNames: [],                  // not cached on email_logs
      bodyExcerpt: (r.body_excerpt ?? '') as string,
      receivedIso: null,
    };

    const accountEmail = (r.accounts?.email ?? null) as string | null;
    const hit = matchRule(features, rules, r.account_id, accountEmail);
    const currentCategory = (r.category ?? null) as CategorySlug | null;

    // No rule fired — leave whatever the AI/previous run decided.
    if (!hit) { result.unchanged += 1; continue; }

    // Rule landed in an AI-always category — those tiers (action_required,
    // personal) are best decided by the AI, so we don't re-route the
    // existing classification on the rule alone.
    if (ALWAYS_AI_CATEGORIES.has(hit.target_category)) {
      // Exception: spam short-circuit — that's a hard rule.
      if (hit.target_category as string === 'spam') {
        // (unreachable — spam isn't in ALWAYS_AI; documented for clarity)
      }
      result.unchanged += 1;
      continue;
    }

    if (hit.target_category === currentCategory) {
      result.unchanged += 1;
      continue;
    }

    // Persist the new category. Method = rule, reason = which rule fired.
    // Audit row writes to personal_email_corrections so the trail shows
    // a bulk reshuffle.
    const { error: updErr } = await sb
      .from('email_logs')
      .update({
        category: hit.target_category,
        category_method: 'rule',
        category_reason: `reshuffle:${hit.match_type}=${hit.match_value}`,
        last_classified_at: new Date().toISOString(),
        needs_review: false,
      })
      .eq('id', r.id);
    if (updErr) continue;

    await sb.from('personal_email_corrections').insert({
      email_log_id: r.id,
      old_category: currentCategory,
      new_category: hit.target_category,
      created_by_user_id: null,
    });

    result.movedByRule += 1;
  }

  result.ok = !result.topLevelError;
  result.durationMs = Date.now() - startMs;

  revalidatePath('/personal/email/setup/ai');
  revalidatePath('/personal/email');
  return result;
}
