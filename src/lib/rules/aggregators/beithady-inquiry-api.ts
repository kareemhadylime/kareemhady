// API-based Beithady inquiry aggregator. Replaces email parsing for the
// `beithady_inquiries_aggregate` rule.
//
// Reads from `guesty_conversations` table (synced from Guesty's
// /v1/communication/conversations endpoint) where:
//   - reservation_status = 'inquiry' (pre-booking questions, no commitment)
//
// The email aggregator classified each question via Claude into
// location_info / amenity / pricing / booking_logistics / availability /
// group_question / other. That requires reading message bodies, which
// we haven't synced yet (posts sync is deferred to Phase 3b). For now,
// by_category is an empty array and category classification is
// skipped — the dashboard still shows totals, per-building breakdown,
// per-guest grouping, and "manual attention" flags based on whether
// the guest's last message is newer than the host's (= guest awaiting
// a response).

import { supabaseAdmin } from '@/lib/supabase';
import type {
  BeithadyInquiryAggregate,
  InquiryBuildingBucket,
  InquiryCategory,
  InquiryGuestGroup,
} from './beithady-inquiry';

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
  reservation_check_in: string | null;
  reservation_check_out: string | null;
  listing_id: string | null;
  listing_nickname: string | null;
  listing_title: string | null;
  listing_building_code: string | null;
  created_at_guesty: string | null;
  modified_at_guesty: string | null;
};

export async function aggregateBeithadyInquiriesFromApi(
  fromIso: string,
  toIso: string
): Promise<BeithadyInquiryAggregate> {
  const sb = supabaseAdmin();

  // Range filter: pick conversations where EITHER the conversation was
  // created OR the guest's last message falls in the range. That way a
  // conversation opened last month but still active this month shows up
  // when the user runs MTD.
  const rows: ConversationRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; offset < 50000; offset += PAGE) {
    const { data, error } = await sb
      .from('guesty_conversations')
      .select(
        `id, priority, state_read, last_message_user_at,
         last_message_nonuser_at, guest_id, guest_full_name, reservation_id,
         reservation_source, reservation_status, reservation_check_in,
         reservation_check_out, listing_id, listing_nickname, listing_title,
         listing_building_code, created_at_guesty, modified_at_guesty`
      )
      .eq('reservation_status', 'inquiry')
      .or(
        `and(created_at_guesty.gte.${fromIso},created_at_guesty.lt.${toIso}),and(last_message_nonuser_at.gte.${fromIso},last_message_nonuser_at.lt.${toIso})`
      )
      .order('created_at_guesty', { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`inquiries_query_failed: ${error.message}`);
    const batch = (data as unknown as ConversationRow[]) || [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  const uniqueGuests = new Set<string>();
  const buildingMap = new Map<string, number>();
  const guestGroups = new Map<
    string,
    {
      guest_name: string;
      inquiry_count: number;
      latest_received_iso: string | null;
      listings: Set<string>;
      has_manual_attention: boolean;
    }
  >();
  let manualAttentionCount = 0;
  const inquiries: BeithadyInquiryAggregate['inquiries'] = [];

  for (const r of rows) {
    const guestName = r.guest_full_name || 'Guest';
    const guestKey = r.guest_id || guestName.toLowerCase();
    uniqueGuests.add(guestKey);

    const building = r.listing_building_code || 'UNKNOWN';
    buildingMap.set(building, (buildingMap.get(building) || 0) + 1);

    // "Manual attention" = guest's last message is newer than host's (or
    // host hasn't replied at all). For inquiries this flags pre-booking
    // leads we owe a response to.
    const guestLast = r.last_message_nonuser_at
      ? new Date(r.last_message_nonuser_at).getTime()
      : 0;
    const hostLast = r.last_message_user_at
      ? new Date(r.last_message_user_at).getTime()
      : 0;
    const awaiting = guestLast > hostLast;
    if (awaiting) manualAttentionCount += 1;

    const receivedIso =
      r.last_message_nonuser_at || r.created_at_guesty || null;

    inquiries.push({
      guest_name: guestName,
      guest_question: null, // requires post sync
      listing_name: r.listing_title || r.listing_nickname || null,
      stay_start: r.reservation_check_in
        ? r.reservation_check_in.slice(0, 10)
        : null,
      stay_end: r.reservation_check_out
        ? r.reservation_check_out.slice(0, 10)
        : null,
      num_adults: null,
      num_children: null,
      num_infants: null,
      received_iso: receivedIso,
      building_code: building === 'UNKNOWN' ? null : building,
      classification: null,
    });

    // Guest grouping — one row per unique guest with aggregated stats.
    const g = guestGroups.get(guestKey);
    if (g) {
      g.inquiry_count += 1;
      if (
        receivedIso &&
        (!g.latest_received_iso || receivedIso > g.latest_received_iso)
      ) {
        g.latest_received_iso = receivedIso;
      }
      if (r.listing_nickname) g.listings.add(r.listing_nickname);
      g.has_manual_attention = g.has_manual_attention || awaiting;
    } else {
      guestGroups.set(guestKey, {
        guest_name: guestName,
        inquiry_count: 1,
        latest_received_iso: receivedIso,
        listings: new Set(r.listing_nickname ? [r.listing_nickname] : []),
        has_manual_attention: awaiting,
      });
    }
  }

  const byBuilding: InquiryBuildingBucket[] = Array.from(buildingMap.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);

  const byGuest: InquiryGuestGroup[] = Array.from(guestGroups.values())
    .map(g => ({
      guest_name: g.guest_name,
      inquiry_count: g.inquiry_count,
      latest_received_iso: g.latest_received_iso,
      categories: [] as InquiryCategory[], // pending posts sync
      listings: Array.from(g.listings),
      has_manual_attention: g.has_manual_attention,
    }))
    .sort((a, b) => b.inquiry_count - a.inquiry_count);

  return {
    email_count: 0,
    parse_errors: 0,
    parse_failures: [],
    total_inquiries: rows.length,
    unique_guests: uniqueGuests.size,
    manual_attention_count: manualAttentionCount,
    classification_errors: 0,
    by_category: [], // pending posts sync
    by_building: byBuilding,
    by_guest: byGuest,
    inquiries,
    guesty_enriched_count: rows.length,
  };
}
