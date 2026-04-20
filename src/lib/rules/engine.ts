import { supabaseAdmin } from '@/lib/supabase';
import { fetchEmailFull, markMessagesAsRead, searchMessages } from '@/lib/gmail';
import { aggregateShopifyOrders } from './aggregators/shopify-order';

export type RuleConditions = {
  from_contains?: string;
  subject_contains?: string;
  to_contains?: string;
  time_window_hours?: number;
};

export type RuleAction = {
  type: 'shopify_order_aggregate';
  currency?: string;
  mark_as_read?: boolean;
};

export type EvalRange = {
  fromIso: string;
  toIso: string;
  label?: string;
  presetId?: string;
};

export async function evaluateRule(ruleId: string, range?: EvalRange) {
  const sb = supabaseAdmin();

  const { data: rule, error: rErr } = await sb
    .from('rules')
    .select('*, account:accounts(*)')
    .eq('id', ruleId)
    .single();
  if (rErr || !rule) throw new Error(`rule_not_found: ${ruleId}`);

  const cond = (rule.conditions || {}) as RuleConditions;
  const action = (rule.actions || {}) as RuleAction;

  const toIso = range?.toIso || new Date().toISOString();
  const requestedFromIso =
    range?.fromIso ||
    new Date(Date.now() - (cond.time_window_hours || 24) * 3600 * 1000).toISOString();

  const yearStartMs = new Date(new Date().getUTCFullYear(), 0, 1).getTime();
  const requestedFromMs = new Date(requestedFromIso).getTime();
  const fromIso =
    requestedFromMs < yearStartMs
      ? new Date(yearStartMs).toISOString()
      : requestedFromIso;
  const clampedToYearStart = fromIso !== requestedFromIso;

  const account = (rule as any).account;
  if (!account?.oauth_refresh_token_encrypted) {
    throw new Error('account_or_token_missing — rule must be bound to a connected account for Phase 4');
  }

  const matches = await searchMessages(account.oauth_refresh_token_encrypted, {
    fromContains: cond.from_contains,
    subjectContains: cond.subject_contains,
    toContains: cond.to_contains,
    afterIso: fromIso,
    beforeIso: toIso,
    maxResults: 500,
  });

  const { data: run, error: runErr } = await sb
    .from('rule_runs')
    .insert({ rule_id: ruleId, input_email_count: matches.length, status: 'running' })
    .select()
    .single();
  if (runErr || !run) throw new Error(`failed_to_open_run: ${runErr?.message}`);

  const timeRange = {
    from: fromIso,
    to: toIso,
    label: range?.label,
    preset_id: range?.presetId,
    clamped_to_year_start: clampedToYearStart || undefined,
    requested_from: clampedToYearStart ? requestedFromIso : undefined,
  };

  try {
    if (!matches.length) {
      await sb
        .from('rule_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: 'succeeded',
          output: {
            order_count: 0,
            total_amount: 0,
            currency: action.currency || 'EGP',
            products: [],
            orders: [],
            parse_errors: 0,
            marked_read: 0,
            mark_errors: 0,
            time_range: timeRange,
          },
        })
        .eq('id', run.id);
      return { ok: true, run_id: run.id, input_email_count: 0 };
    }

    const bodies = await Promise.all(
      matches.map(m => fetchEmailFull(account.oauth_refresh_token_encrypted, m.id))
    );

    let output: any;
    switch (action.type) {
      case 'shopify_order_aggregate':
        output = await aggregateShopifyOrders(bodies, action.currency || 'EGP');
        break;
      default:
        throw new Error(`unknown_action_type: ${(action as any).type}`);
    }

    let marked = 0;
    let markErrors = 0;
    if (action.mark_as_read) {
      const markRes = await markMessagesAsRead(
        account.oauth_refresh_token_encrypted,
        matches.map(m => m.id)
      );
      marked = markRes.marked;
      markErrors = markRes.errors.length;
    }

    await sb
      .from('rule_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'succeeded',
        output: {
          ...output,
          marked_read: marked,
          mark_errors: markErrors,
          time_range: timeRange,
        },
      })
      .eq('id', run.id);

    return { ok: true, run_id: run.id, input_email_count: matches.length };
  } catch (e: any) {
    await sb
      .from('rule_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'failed',
        error: String(e?.message || e),
      })
      .eq('id', run.id);
    throw e;
  }
}
