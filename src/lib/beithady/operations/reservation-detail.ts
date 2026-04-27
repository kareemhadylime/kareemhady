import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { channelMeta } from './channel-meta';
import type { CalendarReservation } from './types';

// Fetches every slice of data the 10-tab reservation drawer needs.
// One ReservationDetail per drawer open. All sub-fetches run in parallel.

export type ReservationMessage = {
  id: string;
  channel: string | null;
  direction: string | null;
  body: string | null;
  from_full_name: string | null;
  ai_classification: string | null;
  ai_suggested_reply: string | null;
  delivery_status: string | null;
  is_automatic: boolean | null;
  sent_at: string | null;
  created_at: string;
};

export type ReservationTask = {
  id: string;
  type: string;
  title: string;
  status: string;
  priority: string | null;
  due_at: string | null;
  notes: string | null;
  completed_at: string | null;
};

export type ReservationUpsell = {
  id: string;
  offered_skus: string[];
  status: string;
  accepted_skus: string[] | null;
  total_usd: number | null;
  paid_at: string | null;
  declined_at: string | null;
  created_at: string;
};

export type ReservationAudit = {
  id: string;
  module: string;
  action: string;
  actor_user_id: string | null;
  metadata: unknown;
  created_at: string;
};

export type AdsAttribution = {
  id: number;
  platform: string;
  campaign_id: number | null;
  ad_id: number | null;
  form_name: string | null;
  building_interest: string | null;
  matched_at: string | null;
  consent_granted: boolean | null;
};

export type LeadAttribution = {
  id: string;
  source: string;
  stage: string;
  rating: number | null;
  contacted_at: string | null;
  quoted_at: string | null;
  booked_at: string | null;
};

export type PastStay = {
  reservation_id: string;
  listing_nickname: string | null;
  building_code: string | null;
  channel: string | null;
  check_in_date: string;
  check_out_date: string;
  status: string | null;
  rating: number | null;
  review_text: string | null;
};

export type ReservationDetail = {
  base: CalendarReservation;
  // Conversation linkage (Phase C)
  conversation: {
    id: string;
    channel: string;
    sla_breach: boolean | null;
    sla_age_seconds: number | null;
    ai_kill_switch: boolean | null;
  } | null;
  messages: ReservationMessage[];
  // Phase F
  tasks: ReservationTask[];
  upsells: ReservationUpsell[];
  // Phase A
  audit: ReservationAudit[];
  // Phase H + I
  adsAttribution: AdsAttribution | null;
  leadAttribution: LeadAttribution | null;
  // Past-stay quick-look (Improvement #12)
  pastStays: PastStay[];
};

export async function getReservationDetail(reservationId: string): Promise<ReservationDetail | null> {
  const sb = supabaseAdmin();

  // Base reservation from the grid view
  const { data: baseRow } = await sb
    .from('beithady_reservation_grid_v')
    .select('*')
    .eq('reservation_id', reservationId)
    .maybeSingle();

  if (!baseRow) return null;

  type DBRes = {
    reservation_id: string;
    confirmation_code: string | null;
    status: string | null;
    channel: string | null;
    source_label: string | null;
    listing_id: string;
    listing_nickname: string | null;
    guest_name: string | null;
    guest_email: string | null;
    guest_phone: string | null;
    check_in_date: string;
    check_out_date: string;
    nights: number | null;
    guest_count: number | null;
    cancelled_at: string | null;
    host_payout: number | string | null;
    fare_accommodation: number | string | null;
    commission: number | string | null;
    cleaning_fee: number | string | null;
    currency: string;
    beithady_guest_id: string | null;
    loyalty_tier: string | null;
    is_vip: boolean | null;
    lifetime_stays: number | null;
    risk_score: number | null;
    risk_breakdown: unknown;
    payment_status: 'paid' | 'partial' | 'unpaid' | 'n_a' | null;
    payment_total_cents: number | null;
    payment_paid_cents: number | null;
    payment_balance_cents: number | null;
    payment_currency: string | null;
    payment_source: string | null;
    flagged_unpaid: boolean | null;
    flagged_prearrival_missing: boolean | null;
    boarding_pass_exists: boolean | null;
    boarding_viewed_at: string | null;
    prearrival_sent_at: string | null;
    is_manual_block: boolean | null;
  };
  const r = baseRow as DBRes;
  const meta = channelMeta(r.channel);
  const base: CalendarReservation = {
    reservation_id: r.reservation_id,
    confirmation_code: r.confirmation_code,
    status: r.status,
    channel: r.channel,
    channel_label: meta.label,
    channel_color: meta.color,
    source_label: r.source_label,
    listing_id: r.listing_id,
    listing_nickname: r.listing_nickname,
    guest_name: r.guest_name,
    guest_email: r.guest_email,
    guest_phone: r.guest_phone,
    check_in_date: r.check_in_date,
    check_out_date: r.check_out_date,
    nights: r.nights,
    guest_count: r.guest_count,
    cancelled_at: r.cancelled_at,
    host_payout: r.host_payout != null ? Number(r.host_payout) : null,
    fare_accommodation: r.fare_accommodation != null ? Number(r.fare_accommodation) : null,
    commission: r.commission != null ? Number(r.commission) : null,
    cleaning_fee: r.cleaning_fee != null ? Number(r.cleaning_fee) : null,
    currency: r.currency || 'USD',
    loyalty_tier: r.loyalty_tier,
    is_vip: r.is_vip,
    lifetime_stays: r.lifetime_stays,
    risk_score: r.risk_score,
    payment_status: r.payment_status,
    payment_balance_cents: r.payment_balance_cents,
    payment_currency: r.payment_currency,
    flagged_unpaid: r.flagged_unpaid,
    flagged_prearrival_missing: r.flagged_prearrival_missing,
    boarding_pass_exists: r.boarding_pass_exists,
    boarding_viewed_at: r.boarding_viewed_at,
    prearrival_sent_at: r.prearrival_sent_at,
    is_manual_block: r.is_manual_block,
  };

  const guestId = r.beithady_guest_id;

  // Run all related fetches in parallel
  const [
    convRes,
    msgRes,
    tasksRes,
    upsellRes,
    auditRes,
    adsRes,
    leadRes,
    pastResRes,
    reviewRes,
  ] = await Promise.all([
    sb.from('beithady_conversations')
      .select('id, channel, sla_breach, sla_age_seconds, ai_kill_switch')
      .eq('reservation_id', reservationId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb.from('beithady_messages')
      .select('id, channel, direction, body, from_full_name, ai_classification, ai_suggested_reply, delivery_status, is_automatic, sent_at, created_at')
      .eq('reservation_id', reservationId)
      .order('created_at', { ascending: false })
      .limit(10),
    sb.from('beithady_tasks')
      .select('id, type, title, status, priority, due_at, notes, completed_at')
      .eq('reservation_id', reservationId)
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(20),
    sb.from('beithady_upsell_offers')
      .select('id, offered_skus, status, accepted_skus, total_usd, paid_at, declined_at, created_at')
      .eq('reservation_id', reservationId)
      .order('created_at', { ascending: false }),
    sb.from('beithady_audit_log')
      .select('id, module, action, actor_user_id, metadata, created_at')
      .eq('target_type', 'reservation')
      .eq('target_id', reservationId)
      .order('created_at', { ascending: false })
      .limit(50),
    sb.from('ads_leads')
      .select('id, platform, campaign_id, ad_id, form_name, building_interest, matched_at, consent_granted')
      .eq('matched_reservation_id', reservationId)
      .maybeSingle(),
    sb.from('beithady_leads')
      .select('id, source, stage, rating, contacted_at, quoted_at, booked_at')
      .eq('reservation_id', reservationId)
      .maybeSingle(),
    // Past stays for this guest (excluding current)
    guestId
      ? sb.from('beithady_reservation_grid_v')
          .select('reservation_id, listing_nickname, building_code, channel, check_in_date, check_out_date, status')
          .eq('beithady_guest_id', guestId)
          .neq('reservation_id', reservationId)
          .lte('check_out_date', new Date().toISOString().slice(0, 10))
          .order('check_in_date', { ascending: false })
          .limit(5)
      : { data: [] },
    // Reviews this guest left for past stays
    guestId
      ? sb.from('guesty_reviews')
          .select('reservation_id, overall_rating, public_review')
          .eq('guest_id', guestId)
          .eq('reviewer_role', 'guest')
      : { data: [] },
  ]);

  type DBPast = {
    reservation_id: string;
    listing_nickname: string | null;
    building_code: string | null;
    channel: string | null;
    check_in_date: string;
    check_out_date: string;
    status: string | null;
  };
  type DBReview = {
    reservation_id: string;
    overall_rating: number | null;
    public_review: string | null;
  };
  const reviewByRes = new Map<string, { rating: number | null; text: string | null }>();
  for (const rev of (reviewRes.data as DBReview[] | null) || []) {
    if (rev.reservation_id) {
      reviewByRes.set(rev.reservation_id, { rating: rev.overall_rating, text: rev.public_review });
    }
  }
  const pastStays: PastStay[] = ((pastResRes.data as DBPast[] | null) || []).map(p => {
    const rev = reviewByRes.get(p.reservation_id);
    return {
      reservation_id: p.reservation_id,
      listing_nickname: p.listing_nickname,
      building_code: p.building_code,
      channel: p.channel,
      check_in_date: p.check_in_date,
      check_out_date: p.check_out_date,
      status: p.status,
      rating: rev?.rating ?? null,
      review_text: rev?.text ?? null,
    };
  });

  return {
    base,
    conversation: (convRes.data as ReservationDetail['conversation']) || null,
    messages: ((msgRes.data as ReservationMessage[] | null) || []),
    tasks: ((tasksRes.data as ReservationTask[] | null) || []),
    upsells: ((upsellRes.data as Array<{
      id: string;
      offered_skus: string[] | null;
      status: string;
      accepted_skus: string[] | null;
      total_usd: number | null;
      paid_at: string | null;
      declined_at: string | null;
      created_at: string;
    }> | null) || []).map(u => ({
      id: u.id,
      offered_skus: u.offered_skus || [],
      status: u.status,
      accepted_skus: u.accepted_skus,
      total_usd: u.total_usd,
      paid_at: u.paid_at,
      declined_at: u.declined_at,
      created_at: u.created_at,
    })),
    audit: ((auditRes.data as ReservationAudit[] | null) || []),
    adsAttribution: (adsRes.data as AdsAttribution | null) || null,
    leadAttribution: (leadRes.data as LeadAttribution | null) || null,
    pastStays,
  };
}
