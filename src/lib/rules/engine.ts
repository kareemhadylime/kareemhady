import { supabaseAdmin } from '@/lib/supabase';
import { fetchEmailFull, markMessagesAsRead, searchMessages } from '@/lib/gmail';
import { aggregateShopifyOrders } from './aggregators/shopify-order';
import { aggregateBeithadyBookings } from './aggregators/beithady-booking';

export type RuleConditions = {
  from_contains?: string;
  subject_contains?: string;
  to_contains?: string;
  time_window_hours?: number;
};

export type RuleAction = {
  type: 'shopify_order_aggregate' | 'beithady_booking_aggregate';
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
      const emptyBase =
        action.type === 'beithady_booking_aggregate'
          ? {
              reservation_count: 0,
              total_payout: 0,
              total_guest_paid: 0,
              total_nights: 0,
              total_guests: 0,
              avg_nights_per_booking: 0,
              avg_rate_per_night: 0,
              avg_payout_per_booking: 0,
              avg_lead_time_days: null,
              unique_guests: 0,
              unique_listings: 0,
              unique_buildings: 0,
              currency: action.currency || 'USD',
              by_channel: [],
              by_building: [],
              by_bedrooms: [],
              by_listing: [],
              top_channel: null,
              top_building: null,
              top_bedrooms: null,
              top_listing: null,
              bookings: [],
              parse_errors: 0,
              parse_failures: [],
              airbnb_emails_checked: 0,
              airbnb_confirmations_parsed: 0,
              airbnb_parse_errors: 0,
              airbnb_parse_failures: [],
              airbnb_matched_in_guesty: 0,
              missing_from_guesty: [],
              guesty_not_in_airbnb: 0,
            }
          : {
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
    let airbnbMatchIds: string[] = [];
    switch (action.type) {
      case 'shopify_order_aggregate':
        output = await aggregateShopifyOrders(bodies, action.currency || 'EGP');
        break;
      case 'beithady_booking_aggregate': {
        const airbnbMatches = await searchMessages(
          account.oauth_refresh_token_encrypted,
          {
            subjectContains: 'Reservation confirmed',
            toContains: 'guesty@beithady.com',
            afterIso: fromIso,
            beforeIso: toIso,
            maxResults: 500,
          }
        );
        airbnbMatchIds = airbnbMatches.map(m => m.id);
        const airbnbBodies = await Promise.all(
          airbnbMatches.map(m =>
            fetchEmailFull(account.oauth_refresh_token_encrypted, m.id)
          )
        );
        output = await aggregateBeithadyBookings(
          bodies,
          action.currency || 'USD',
          airbnbBodies
        );
        break;
      }
      default:
        throw new Error(`unknown_action_type: ${(action as any).type}`);
    }

    let marked = 0;
    let markErrors = 0;
    let markErrorReason: string | undefined;
    let markedAirbnb = 0;
    let markAirbnbErrors = 0;
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
      if (airbnbMatchIds.length > 0) {
        const markAirbnbRes = await markMessagesAsRead(
          account.oauth_refresh_token_encrypted,
          airbnbMatchIds
        );
        markedAirbnb = markAirbnbRes.marked;
        markAirbnbErrors = markAirbnbRes.errors.length;
        if (markAirbnbRes.errors.length > 0 && !markErrorReason) {
          const first = markAirbnbRes.errors[0];
          const colon = first.indexOf(': ');
          markErrorReason = (colon >= 0 ? first.slice(colon + 2) : first).slice(0, 300);
        }
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
          airbnb_emails_matched: airbnbMatchIds.length,
          marked_read_airbnb: markedAirbnb,
          mark_errors_airbnb: markAirbnbErrors,
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
