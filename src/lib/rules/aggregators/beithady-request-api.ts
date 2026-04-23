// API-based Beithady guest-request aggregator. Replaces email parsing
// for the `beithady_requests_aggregate` rule.
//
// Reads from `guesty_conversations` where reservation_status in (confirmed,
// checked_in, checked_out) — i.e. real bookings with messaging activity
// (pre-arrival, in-stay, post-stay but pre-review).
//
// Without per-message bodies (posts sync is Phase 3b), we cannot classify
// messages into date_change / amenity_request / immediate_complaint /
// refund_dispute / check_in_help / general_question / other categories.
// So by_category is empty; urgency can't be inferred. Instead we surface
// the pieces the API does give us cleanly:
//   - total conversations with guest activity in the range
//   - unique reservations
//   - "needs response" count (guest awaiting a host reply)
//   - by-reservation groupings with latest message timestamps
//   - by-building breakdown

import { supabaseAdmin } from '@/lib/supabase';
import type {
  BeithadyRequestAggregate,
  RequestReservationGroup,
  RequestCategory,
  RequestUrgency,
} from './beithady-request';

type ConversationRow = {
  id: string;
  priority: number | null;
  state_read: boolean | null;
  last_message_user_at: string | null;
  last_message_nonuser_at: string | null;
  guest_id: string | null;
  guest_full_name: string | null;
  reservation_id: string | null;
  reservation_source: string | null;
  reservation_status: string | null;
  reservation_confirmation_code: string | null;
  reservation_check_in: string | null;
  reservation_check_out: string | null;
  listing_id: string | null;
  listing_nickname: string | null;
  listing_title: string | null;
  listing_building_code: string | null;
  created_at_guesty: string | null;
  modified_at_guesty: string | null;
};

export async function aggregateBeithadyRequestsFromApi(
  fromIso: string,
  toIso: string
): Promise<BeithadyRequestAggregate> {
  const sb = supabaseAdmin();

  // Confirmed and stayed conversations where the guest messaged inside
  // the range.
  const rows: ConversationRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; offset < 50000; offset += PAGE) {
    const { data, error } = await sb
      .from('guesty_conversations')
      .select(
        `id, priority, state_read, last_message_user_at,
         last_message_nonuser_at, guest_id, guest_full_name, reservation_id,
         reservation_source, reservation_status,
         reservation_confirmation_code, reservation_check_in,
         reservation_check_out, listing_id, listing_nickname, listing_title,
         listing_building_code, created_at_guesty, modified_at_guesty`
      )
      .in('reservation_status', ['confirmed', 'checked_in', 'checked_out'])
      .gte('last_message_nonuser_at', fromIso)
      .lt('last_message_nonuser_at', toIso)
      .order('last_message_nonuser_at', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`requests_query_failed: ${error.message}`);
    const batch = (data as unknown as ConversationRow[]) || [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  const uniqueReservations = new Set<string>();
  const groups = new Map<
    string,
    RequestReservationGroup
  >();
  let immediateCount = 0;
  const messages: BeithadyRequestAggregate['messages'] = [];

  for (const r of rows) {
    const groupKey =
      r.reservation_confirmation_code || r.reservation_id || r.id;
    uniqueReservations.add(groupKey);

    const guestLast = r.last_message_nonuser_at
      ? new Date(r.last_message_nonuser_at).getTime()
      : 0;
    const hostLast = r.last_message_user_at
      ? new Date(r.last_message_user_at).getTime()
      : 0;
    const awaiting = guestLast > hostLast;
    if (awaiting) immediateCount += 1;

    const guestName = r.guest_full_name || 'Guest';
    const listingName = r.listing_title || r.listing_nickname || null;
    const building = r.listing_building_code;

    messages.push({
      guest_name: guestName,
      listing_name: listingName,
      check_in_date: r.reservation_check_in
        ? r.reservation_check_in.slice(0, 10)
        : null,
      check_out_date: r.reservation_check_out
        ? r.reservation_check_out.slice(0, 10)
        : null,
      num_adults: null,
      num_children: null,
      num_infants: null,
      message_text: null, // requires posts sync
      has_image: false,
      message_count_in_thread: 1,
      received_iso: r.last_message_nonuser_at,
      subject: `Re: Reservation ${r.reservation_confirmation_code || groupKey}`,
      group_key: groupKey,
      building_code: building,
      classification: null,
    });

    const existing = groups.get(groupKey);
    if (existing) {
      existing.message_count += 1;
      if (
        r.last_message_nonuser_at &&
        (!existing.latest_received_iso ||
          r.last_message_nonuser_at > existing.latest_received_iso)
      ) {
        existing.latest_received_iso = r.last_message_nonuser_at;
      }
    } else {
      groups.set(groupKey, {
        group_key: groupKey,
        guest_name: guestName,
        listing_name: listingName,
        building_code: building,
        check_in_date: r.reservation_check_in
          ? r.reservation_check_in.slice(0, 10)
          : null,
        check_out_date: r.reservation_check_out
          ? r.reservation_check_out.slice(0, 10)
          : null,
        message_count: 1,
        categories: [] as RequestCategory[],
        max_urgency: (awaiting ? 'high' : 'normal') as RequestUrgency,
        has_immediate_complaint: false,
        latest_received_iso: r.last_message_nonuser_at,
        latest_summary: null,
        latest_suggested_action: null,
      });
    }
  }

  const byReservation: RequestReservationGroup[] = Array.from(groups.values()).sort(
    (a, b) => {
      const ab = a.latest_received_iso || '';
      const bb = b.latest_received_iso || '';
      return bb.localeCompare(ab);
    }
  );

  return {
    email_count: 0,
    parse_errors: 0,
    parse_failures: [],
    total_messages: rows.length,
    unique_reservations: uniqueReservations.size,
    immediate_count: immediateCount,
    classification_errors: 0,
    by_category: [], // pending posts sync
    by_reservation: byReservation,
    messages,
    guesty_enriched_count: rows.length,
  };
}
