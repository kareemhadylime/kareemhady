import { supabaseAdmin } from '@/lib/supabase';
import { fetchEmailFull, markMessagesAsRead, searchMessages } from '@/lib/gmail';
import { aggregateShopifyOrders } from './aggregators/shopify-order';
import { aggregateBeithadyBookingsFromApi } from './aggregators/beithady-booking-api';
import { aggregateBeithadyReviewsFromApi } from './aggregators/beithady-review-api';
import { aggregateBeithadyPayoutsFromApi } from './aggregators/beithady-payout-api';
import { aggregateBeithadyInquiriesFromApi } from './aggregators/beithady-inquiry-api';
import { aggregateBeithadyRequestsFromApi } from './aggregators/beithady-request-api';
import { fetchStripePayoutBreakdown } from '@/lib/stripe-payouts';

export type RuleConditions = {
  from_contains?: string;
  subject_contains?: string;
  to_contains?: string;
  time_window_hours?: number;
};

export type RuleAction = {
  type:
    | 'shopify_order_aggregate'
    | 'beithady_booking_aggregate'
    | 'beithady_payout_aggregate'
    | 'beithady_reviews_aggregate'
    | 'beithady_inquiries_aggregate'
    | 'beithady_requests_aggregate';
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
  const timeRangeMeta = {
    from: fromIso,
    to: toIso,
    label: range?.label,
    preset_id: range?.presetId,
    clamped_to_year_start: clampedToYearStart || undefined,
    requested_from: clampedToYearStart ? requestedFromIso : undefined,
  };

  // API-based Beithady rules — skip the Gmail account requirement. These
  // read directly from the Guesty mirror tables (guesty_reservations,
  // guesty_reviews) synced by src/lib/run-guesty-sync.ts.
  if (action.type === 'beithady_booking_aggregate') {
    return evaluateBookingRuleFromApi({
      ruleId,
      action,
      fromIso,
      toIso,
      timeRange: timeRangeMeta,
    });
  }

  if (action.type === 'beithady_reviews_aggregate') {
    return evaluateReviewsRuleFromApi({
      ruleId,
      fromIso,
      toIso,
      timeRange: timeRangeMeta,
    });
  }

  if (action.type === 'beithady_payout_aggregate') {
    return evaluatePayoutRuleFromApi({
      ruleId,
      fromIso,
      toIso,
      timeRange: timeRangeMeta,
    });
  }

  if (action.type === 'beithady_inquiries_aggregate') {
    return evaluateInquiriesRuleFromApi({
      ruleId,
      fromIso,
      toIso,
      timeRange: timeRangeMeta,
    });
  }

  if (action.type === 'beithady_requests_aggregate') {
    return evaluateRequestsRuleFromApi({
      ruleId,
      fromIso,
      toIso,
      timeRange: timeRangeMeta,
    });
  }

  // Remaining rules still parse Gmail — require a connected account.
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
      const emptyBase = {
        order_count: 0,
        total_amount: 0,
        currency: action.currency || 'EGP',
        products: [],
        orders: [],
        parse_errors: 0,
      };
      await sb
        .from('rule_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: 'succeeded',
          output: {
            ...emptyBase,
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
    let markErrorReason: string | undefined;
    if (action.mark_as_read) {
      const markRes = await markMessagesAsRead(
        account.oauth_refresh_token_encrypted,
        matches.map(m => m.id)
      );
      marked = markRes.marked;
      markErrors = markRes.errors.length;
      if (markRes.errors.length > 0) {
        const first = markRes.errors[0];
        const colon = first.indexOf(': ');
        markErrorReason = (colon >= 0 ? first.slice(colon + 2) : first).slice(0, 300);
      }
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
          mark_error_reason: markErrorReason,
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

// API-based payout evaluator. Reads guesty_reservations.host_payout in the
// range (filtered to confirmed+ stays) + Stripe REST API for the
// reconciliation view. Replaces the email-parsing path that read Airbnb
// payout emails + Stripe deposit emails.
async function evaluatePayoutRuleFromApi(args: {
  ruleId: string;
  fromIso: string;
  toIso: string;
  timeRange: Record<string, unknown>;
}) {
  const { ruleId, fromIso, toIso, timeRange } = args;
  const sb = supabaseAdmin();

  const { data: run, error: runErr } = await sb
    .from('rule_runs')
    .insert({ rule_id: ruleId, input_email_count: 0, status: 'running' })
    .select()
    .single();
  if (runErr || !run) throw new Error(`failed_to_open_run: ${runErr?.message}`);

  try {
    // Stripe breakdown is non-fatal — missing key returns { error } and
    // downstream aggregator handles null.
    const stripeApi = await fetchStripePayoutBreakdown(fromIso, toIso);
    const output = await aggregateBeithadyPayoutsFromApi(
      fromIso,
      toIso,
      stripeApi
    );

    await sb
      .from('rule_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'succeeded',
        output: {
          ...output,
          marked_read: 0,
          mark_errors: 0,
          source: 'guesty-api',
          time_range: timeRange,
        },
      })
      .eq('id', run.id);
    return { ok: true, run_id: run.id, input_email_count: 0 };
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

// API-based inquiries evaluator. Reads guesty_conversations where
// reservation_status='inquiry' (pre-booking questions). Replaces email
// parsing of Airbnb "Inquiry for X" notifications.
async function evaluateInquiriesRuleFromApi(args: {
  ruleId: string;
  fromIso: string;
  toIso: string;
  timeRange: Record<string, unknown>;
}) {
  const { ruleId, fromIso, toIso, timeRange } = args;
  const sb = supabaseAdmin();

  const { data: run, error: runErr } = await sb
    .from('rule_runs')
    .insert({ rule_id: ruleId, input_email_count: 0, status: 'running' })
    .select()
    .single();
  if (runErr || !run) throw new Error(`failed_to_open_run: ${runErr?.message}`);

  try {
    const output = await aggregateBeithadyInquiriesFromApi(fromIso, toIso);
    await sb
      .from('rule_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'succeeded',
        output: {
          ...output,
          marked_read: 0,
          mark_errors: 0,
          source: 'guesty-api',
          time_range: timeRange,
        },
      })
      .eq('id', run.id);
    return { ok: true, run_id: run.id, input_email_count: 0 };
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

// API-based guest-request evaluator. Reads guesty_conversations where
// reservation_status in (confirmed,checked_in,checked_out) and the guest
// messaged inside the range. Replaces email parsing of "RE: Reservation..."
// threads.
async function evaluateRequestsRuleFromApi(args: {
  ruleId: string;
  fromIso: string;
  toIso: string;
  timeRange: Record<string, unknown>;
}) {
  const { ruleId, fromIso, toIso, timeRange } = args;
  const sb = supabaseAdmin();

  const { data: run, error: runErr } = await sb
    .from('rule_runs')
    .insert({ rule_id: ruleId, input_email_count: 0, status: 'running' })
    .select()
    .single();
  if (runErr || !run) throw new Error(`failed_to_open_run: ${runErr?.message}`);

  try {
    const output = await aggregateBeithadyRequestsFromApi(fromIso, toIso);
    await sb
      .from('rule_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'succeeded',
        output: {
          ...output,
          marked_read: 0,
          mark_errors: 0,
          source: 'guesty-api',
          time_range: timeRange,
        },
      })
      .eq('id', run.id);
    return { ok: true, run_id: run.id, input_email_count: 0 };
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

// API-based booking evaluator. Reads guesty_reservations (synced daily) and
// writes a rule_run row. No Gmail access. Replaces the email-parsing path.
async function evaluateBookingRuleFromApi(args: {
  ruleId: string;
  action: RuleAction;
  fromIso: string;
  toIso: string;
  timeRange: Record<string, unknown>;
}) {
  const { ruleId, action, fromIso, toIso, timeRange } = args;
  const sb = supabaseAdmin();

  const { data: run, error: runErr } = await sb
    .from('rule_runs')
    .insert({ rule_id: ruleId, input_email_count: 0, status: 'running' })
    .select()
    .single();
  if (runErr || !run) throw new Error(`failed_to_open_run: ${runErr?.message}`);

  try {
    const output = await aggregateBeithadyBookingsFromApi(
      fromIso,
      toIso,
      action.currency || 'USD'
    );
    await sb
      .from('rule_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'succeeded',
        output: {
          ...output,
          marked_read: 0,
          mark_errors: 0,
          source: 'guesty-api',
          time_range: timeRange,
        },
      })
      .eq('id', run.id);
    return { ok: true, run_id: run.id, input_email_count: 0 };
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

// API-based reviews evaluator. Reads guesty_reviews (synced daily from
// /v1/reviews) and writes a rule_run row. No Gmail access.
async function evaluateReviewsRuleFromApi(args: {
  ruleId: string;
  fromIso: string;
  toIso: string;
  timeRange: Record<string, unknown>;
}) {
  const { ruleId, fromIso, toIso, timeRange } = args;
  const sb = supabaseAdmin();

  const { data: run, error: runErr } = await sb
    .from('rule_runs')
    .insert({ rule_id: ruleId, input_email_count: 0, status: 'running' })
    .select()
    .single();
  if (runErr || !run) throw new Error(`failed_to_open_run: ${runErr?.message}`);

  try {
    const output = await aggregateBeithadyReviewsFromApi(fromIso, toIso);
    await sb
      .from('rule_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'succeeded',
        output: {
          ...output,
          marked_read: 0,
          mark_errors: 0,
          time_range: timeRange,
        },
      })
      .eq('id', run.id);
    return { ok: true, run_id: run.id, input_email_count: 0 };
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

