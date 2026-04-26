import { createHash } from 'node:crypto';
import { supabaseAdmin } from './supabase';
import {
  listGuestyListings,
  listGuestyReservations,
  listGuestyReviews,
  listGuestyConversations,
  listGuestyConversationPosts,
  type GuestyListing,
  type GuestyReservation,
  type GuestyReview,
  type GuestyConversation,
  type GuestyConversationPost,
} from './guesty';
import {
  classifyInquiry,
  classifyRequest,
} from './rules/classify-conversation';

// Full Guesty mirror. Pulls:
//  1) All listings (with listingType + masterListingId for the Multi-Unit
//     Strategy surfacing used by the Pricing dashboard)
//  2) Reservations in the last 365 days (any status).
//
// Safe to run daily — we upsert by id, so re-runs only add new rows and
// update changed ones.

const BACKFILL_DAYS = 365;
const LISTINGS_FIELDS =
  '_id nickname title active listingType masterListingId bedrooms accommodates propertyType accountId address tags customFields';
// Includes cancelledAt + lastUpdatedAt so the daily report's cancellations
// section can pin to the correct timestamp. Without these, the previous
// sync was silently dropping cancellation date info: the mirror's
// `updated_at_odoo` column tracks Guesty's `updatedAt`, which doesn't
// always refresh on status flips for older reservations.
const RESERVATION_FIELDS =
  '_id confirmationCode status source listingId accountId guest.fullName guest.email guest.phone checkInDateLocalized checkOutDateLocalized nightsCount guestsCount money.hostPayout money.guestPaid money.fareAccommodation money.cleaningFee money.currency integration.platform integration.confirmationCode createdAt updatedAt cancelledAt lastUpdatedAt';

// Normalize a Guesty /reviews row into our guesty_reviews schema. Each
// channel ships a different `rawReview` shape:
//   airbnb2      → rawReview.overall_rating (1-5), rawReview.public_review,
//                  rawReview.category_ratings[] with tag codes
//   bookingCom   → rawReview.scoring.review_score (0-10, halved to match
//                  Airbnb scale), rawReview.content, scoring.{clean,staff,
//                  value,comfort,location,facilities} per-category 0-10
function normalizeReviewRow(rv: GuestyReview): Record<string, unknown> {
  const raw = (rv.rawReview || {}) as Record<string, unknown>;
  const channel = typeof rv.channelId === 'string' ? rv.channelId : null;
  const lowerChannel = String(channel || '').toLowerCase();

  let overallRating: number | null = null;
  let publicReview: string | null = null;
  let reviewerRole: string | null =
    typeof raw.reviewer_role === 'string' ? (raw.reviewer_role as string) : null;
  let categoryRatings: unknown = null;

  if (lowerChannel.startsWith('airbnb')) {
    overallRating =
      typeof raw.overall_rating === 'number' ? (raw.overall_rating as number) : null;
    publicReview =
      typeof raw.public_review === 'string' ? (raw.public_review as string) : null;
    categoryRatings = Array.isArray(raw.category_ratings)
      ? raw.category_ratings
      : null;
  } else if (lowerChannel.startsWith('booking')) {
    const scoring = (raw.scoring || {}) as Record<string, number | undefined>;
    const score = scoring.review_score;
    overallRating = typeof score === 'number' ? Math.round(score / 2) : null;
    publicReview = typeof raw.content === 'string' ? (raw.content as string) : null;
    reviewerRole = reviewerRole || 'guest';
    const KEYS = ['clean', 'staff', 'value', 'comfort', 'location', 'facilities'];
    const out: Array<{
      category: string;
      rating: number;
      review_category_tags: string[];
    }> = [];
    for (const k of KEYS) {
      const v = scoring[k];
      if (typeof v === 'number') {
        out.push({ category: k, rating: Math.round(v / 2), review_category_tags: [] });
      }
    }
    categoryRatings = out.length > 0 ? out : null;
  } else {
    // Unknown channel — best-effort.
    overallRating =
      typeof raw.overall_rating === 'number' ? (raw.overall_rating as number) : null;
    publicReview =
      typeof raw.public_review === 'string'
        ? (raw.public_review as string)
        : typeof raw.content === 'string'
          ? (raw.content as string)
          : null;
    categoryRatings = Array.isArray(raw.category_ratings)
      ? raw.category_ratings
      : null;
  }

  return {
    id: String(rv._id),
    account_id: typeof rv.accountId === 'string' ? rv.accountId : null,
    external_review_id:
      typeof rv.externalReviewId === 'string' ? rv.externalReviewId : null,
    channel_id: channel,
    external_listing_id:
      typeof rv.externalListingId === 'string' ? rv.externalListingId : null,
    external_reservation_id:
      typeof rv.externalReservationId === 'string'
        ? rv.externalReservationId
        : null,
    listing_id: typeof rv.listingId === 'string' ? rv.listingId : null,
    reservation_id:
      typeof rv.reservationId === 'string' ? rv.reservationId : null,
    guest_id: typeof rv.guestId === 'string' ? rv.guestId : null,
    reviewer_role: reviewerRole,
    overall_rating: overallRating,
    public_review: publicReview,
    category_ratings: categoryRatings,
    review_replies: Array.isArray(rv.reviewReplies) ? rv.reviewReplies : null,
    submitted: typeof raw.submitted === 'boolean' ? (raw.submitted as boolean) : null,
    hidden: typeof raw.hidden === 'boolean' ? (raw.hidden as boolean) : null,
    created_at_guesty: toTs(rv.createdAtGuesty) || toTs(rv.createdAt),
    created_at_source:
      toTs(raw.created_at as unknown) ||
      toTs(raw.created_timestamp as unknown),
    updated_at_guesty: toTs(rv.updatedAtGuesty) || toTs(rv.updatedAt),
    raw: (rv as unknown) as Record<string, unknown>,
    synced_at: new Date().toISOString(),
  };
}

function extractBuildingCode(nickname: string | null | undefined): string | null {
  if (!nickname) return null;
  const n = nickname.toUpperCase();
  const major = /\bBH-?(26|34|73|435)(?:[-\s]|$)/.exec(n);
  if (major) return `BH-${major[1]}`;
  if (/\bBH-?(OK|OKAT)/.test(n)) return 'BH-OK';
  if (/\bBH-?\d/.test(n)) return 'BH-OK';
  return null;
}

function toDate(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const slice = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(slice) ? slice : null;
}

function toTs(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function runGuestySync(trigger: 'cron' | 'manual') {
  const sb = supabaseAdmin();

  const { data: run, error: runErr } = await sb
    .from('guesty_sync_runs')
    .insert({ trigger, status: 'running' })
    .select()
    .single();
  if (runErr || !run) {
    return { ok: false, error: 'failed_to_open_run', details: runErr };
  }
  const runId = (run as { id: string }).id;

  let listingsSynced = 0;
  let reservationsSynced = 0;
  let reviewsSynced = 0;
  let conversationsSynced = 0;
  let conversationPostsFetched = 0;
  let conversationsClassified = 0;

  try {
    // 1. Listings — small set (~100 for Beithady), fetch in one go then page
    // as a safety net.
    let lOffset = 0;
    while (lOffset < 1000) {
      const batch = await listGuestyListings({
        limit: 100,
        skip: lOffset,
        fields: LISTINGS_FIELDS,
      });
      const results = batch.results || [];
      if (results.length === 0) break;

      const rows = results.map((l: GuestyListing) => {
        const addr = (l.address || {}) as {
          full?: string;
          city?: string;
          country?: string;
        };
        return {
          id: String(l._id),
          account_id: typeof l.accountId === 'string' ? l.accountId : null,
          nickname: typeof l.nickname === 'string' ? l.nickname : null,
          title: typeof l.title === 'string' ? l.title : null,
          listing_type: (l.listingType as string | null) || null,
          master_listing_id:
            typeof l.masterListingId === 'string' ? l.masterListingId : null,
          bedrooms: typeof l.bedrooms === 'number' ? l.bedrooms : null,
          accommodates:
            typeof l.accommodates === 'number' ? l.accommodates : null,
          property_type:
            typeof l.propertyType === 'string' ? l.propertyType : null,
          active: typeof l.active === 'boolean' ? l.active : null,
          tags: Array.isArray(l.tags) ? l.tags : [],
          address_full: typeof addr.full === 'string' ? addr.full : null,
          address_city: typeof addr.city === 'string' ? addr.city : null,
          address_country:
            typeof addr.country === 'string' ? addr.country : null,
          building_code: extractBuildingCode(
            typeof l.nickname === 'string' ? l.nickname : null
          ),
          raw: (l as unknown) as Record<string, unknown>,
          last_synced_at: new Date().toISOString(),
        };
      });

      for (let i = 0; i < rows.length; i += 200) {
        await sb
          .from('guesty_listings')
          .upsert(rows.slice(i, i + 200), { onConflict: 'id' });
      }
      listingsSynced += results.length;
      if (results.length < 100) break;
      lOffset += 100;
    }

    // 2. Reservations — filtered by createdAt >= now - 365d.
    // Guesty's list endpoint uses MongoDB-style filters serialized as JSON.
    const cutoff = new Date(
      Date.now() - BACKFILL_DAYS * 24 * 3600 * 1000
    ).toISOString();
    let rOffset = 0;
    while (rOffset < 50000) {
      const batch = await listGuestyReservations({
        limit: 100,
        skip: rOffset,
        filters: { createdAt: { $gte: cutoff } },
        sort: 'createdAt',
        fields: RESERVATION_FIELDS,
      });
      const results = batch.results || [];
      if (results.length === 0) break;

      const rows = results.map((r: GuestyReservation) => {
        const money = (r.money || {}) as {
          hostPayout?: number;
          guestPaid?: number;
          fareAccommodation?: number;
          cleaningFee?: number;
          currency?: string;
        };
        const integration = (r.integration || {}) as {
          platform?: string;
          confirmationCode?: string;
        };
        const guest = (r.guest || {}) as {
          fullName?: string;
          email?: string;
          phone?: string;
        };
        return {
          id: String(r._id),
          confirmation_code:
            typeof r.confirmationCode === 'string' ? r.confirmationCode : null,
          platform_confirmation_code:
            typeof integration.confirmationCode === 'string'
              ? integration.confirmationCode
              : null,
          status: typeof r.status === 'string' ? r.status : null,
          source: typeof r.source === 'string' ? r.source : null,
          integration_platform:
            typeof integration.platform === 'string'
              ? integration.platform
              : null,
          listing_id: typeof r.listingId === 'string' ? r.listingId : null,
          listing_nickname: null as string | null, // filled below via join pass
          guest_name: guest.fullName || null,
          guest_email: guest.email || null,
          guest_phone: guest.phone || null,
          check_in_date: toDate(r.checkInDateLocalized),
          check_out_date: toDate(r.checkOutDateLocalized),
          nights: typeof r.nightsCount === 'number' ? r.nightsCount : null,
          guests: typeof r.guestsCount === 'number' ? r.guestsCount : null,
          currency: typeof money.currency === 'string' ? money.currency : null,
          host_payout: toNumber(money.hostPayout),
          guest_paid: toNumber(money.guestPaid),
          fare_accommodation: toNumber(money.fareAccommodation),
          cleaning_fee: toNumber(money.cleaningFee),
          created_at_odoo: toTs(r.createdAt),
          updated_at_odoo: toTs(r.updatedAt),
          // v2 daily report: pin cancellation date so the cancellations
          // section can find recent cancels without falling back to the
          // (often-stale) updatedAt timestamp.
          cancelled_at: toTs(
            (r as unknown as { cancelledAt?: string }).cancelledAt
          ),
          raw: (r as unknown) as Record<string, unknown>,
          synced_at: new Date().toISOString(),
        };
      });

      for (let i = 0; i < rows.length; i += 200) {
        await sb
          .from('guesty_reservations')
          .upsert(rows.slice(i, i + 200), { onConflict: 'id' });
      }
      reservationsSynced += results.length;
      if (results.length < 100) break;
      rOffset += 100;
    }

    // 3. Backfill listing_nickname on reservation rows (one SQL update).
    // Cheaper than joining per-row during sync. Wrap in try — RPC may not
    // exist on fresh environments.
    try {
      await sb.rpc('guesty_backfill_reservation_nicknames');
    } catch {
      // ignore
    }

    // 4. Reviews — full list pull. Guesty's /reviews endpoint does NOT
    // support `filters` or `sort` (probed 2026-04-23), so we paginate the
    // full set every run. Tenant has ~800 reviews today; scales to ~10k
    // before we need an incremental strategy. Upsert by id. The response
    // shape is inconsistent across channels (airbnb2 vs bookingCom) — we
    // normalize into a common schema here so the aggregator doesn't need
    // per-channel branches.
    let revOffset = 0;
    const REV_PAGE = 100;
    while (revOffset < 100000) {
      const batch = await listGuestyReviews({
        limit: REV_PAGE,
        skip: revOffset,
      });
      const results = batch.results || [];
      if (results.length === 0) break;

      const rows = results.map((rv: GuestyReview) =>
        normalizeReviewRow(rv)
      );

      for (let i = 0; i < rows.length; i += 200) {
        await sb
          .from('guesty_reviews')
          .upsert(rows.slice(i, i + 200), { onConflict: 'id' });
      }
      reviewsSynced += results.length;
      if (results.length < REV_PAGE) break;
      revOffset += REV_PAGE;
    }

    // 5. Conversations — cursor-paginated (no skip, no filter). We pull
    // newest-first and stop once we've seen conversations already synced
    // AND unchanged (modifiedAt <= our mirror's modified_at_guesty). On
    // first-run / long-staleness, that means a full backfill of all 6k+
    // conversations. On nightly runs, early-exits after a few pages.
    {
      // Build a lookup of ids we've already synced recently so we can
      // short-circuit. Cheap: ~6k rows.
      const { data: existing } = await sb
        .from('guesty_conversations')
        .select('id, modified_at_guesty');
      const seen = new Map<string, string | null>();
      for (const row of (existing as Array<{
        id: string;
        modified_at_guesty: string | null;
      }> | null) || []) {
        seen.set(row.id, row.modified_at_guesty);
      }

      let after: string | undefined = undefined;
      let unchangedStreak = 0;
      const CONV_PAGE = 50;
      // Safety cap — full tenant is ~6,618 as of 2026-04-23; cap at
      // 15,000 to avoid runaway if Guesty returns an endless cursor.
      for (let loop = 0; loop < 300; loop++) {
        const batch = await listGuestyConversations({
          limit: CONV_PAGE,
          after,
        });
        const convs = batch.conversations || [];
        if (convs.length === 0) break;

        const rows = convs.map((c: GuestyConversation) =>
          normalizeConversationRow(c)
        );

        for (let i = 0; i < rows.length; i += 200) {
          await sb
            .from('guesty_conversations')
            .upsert(rows.slice(i, i + 200), { onConflict: 'id' });
        }
        conversationsSynced += convs.length;

        // Count how many rows in this page were already up-to-date.
        let pageUnchanged = 0;
        for (const r of rows) {
          const prev = seen.get(r.id as string);
          const curr = r.modified_at_guesty as string | null;
          if (prev && curr && prev >= curr) pageUnchanged += 1;
        }
        if (pageUnchanged === rows.length) {
          unchangedStreak += 1;
        } else {
          unchangedStreak = 0;
        }
        // Two full pages of unchanged rows → safe to assume older pages
        // are also unchanged. Exit.
        if (unchangedStreak >= 2) break;

        after = batch.cursor?.after;
        if (!after) break;
        if (conversationsSynced >= 15000) break;
      }
    }

    // 6. Posts + classification for recently-modified conversations.
    // Nightly window: conversations modified in the last 2 days AND in
    // Beithady-relevant statuses. Full backfill of history is handled by
    // a one-off script (sync-guesty-classify.mjs) — this loop catches
    // daily changes so the aggregators stay fresh.
    {
      const since = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
      const { data: targets } = await sb
        .from('guesty_conversations')
        .select(
          `id, reservation_status, reservation_check_in,
           reservation_check_out, listing_title, listing_nickname,
           classification_input_hash`
        )
        .in('reservation_status', [
          'inquiry',
          'confirmed',
          'checked_in',
          'checked_out',
        ])
        .or(
          `modified_at_guesty.gte.${since},last_message_nonuser_at.gte.${since}`
        )
        .limit(500);

      const rowsToProcess =
        (targets as Array<{
          id: string;
          reservation_status: string | null;
          reservation_check_in: string | null;
          reservation_check_out: string | null;
          listing_title: string | null;
          listing_nickname: string | null;
          classification_input_hash: string | null;
        }> | null) || [];

      // Process sequentially — keeps Anthropic + Guesty call rates low.
      // Daily window is small enough that sequential is fine.
      for (const t of rowsToProcess) {
        try {
          const postsRes = await listGuestyConversationPosts(t.id, {
            limit: 50,
          });
          conversationPostsFetched += postsRes.posts?.length || 0;

          // v2 daily report: persist each post into guesty_conversation_posts
          // so the conversations builder can compute response time, message
          // counts, and per-agent ranking. Upsert by Guesty post _id.
          const postRows = (postsRes.posts || [])
            .filter(p => p && typeof p._id === 'string' && typeof p.createdAt === 'string')
            .map(p => {
              const from = (p.from || {}) as { type?: string; fullName?: string };
              const module = (p.module || {}) as { type?: string; subject?: string; reservationId?: string };
              const text =
                (typeof p.plainTextBody === 'string' && p.plainTextBody) ||
                (typeof p.body === 'string' && p.body) ||
                '';
              return {
                id: String(p._id),
                conversation_id: t.id,
                account_id:
                  typeof (p as unknown as { accountId?: string }).accountId === 'string'
                    ? (p as unknown as { accountId?: string }).accountId
                    : null,
                reservation_id: typeof module.reservationId === 'string' ? module.reservationId : null,
                sent_by: typeof p.sentBy === 'string' ? p.sentBy : null,
                from_type: typeof from.type === 'string' ? from.type : null,
                from_full_name: typeof from.fullName === 'string' ? from.fullName : null,
                is_automatic: typeof p.isAutomatic === 'boolean' ? p.isAutomatic : null,
                module_type: typeof module.type === 'string' ? module.type : null,
                module_subject: typeof module.subject === 'string' ? module.subject.slice(0, 500) : null,
                body_text: text ? text.slice(0, 4000) : null,
                created_at_guesty: p.createdAt,
                raw: p as unknown as Record<string, unknown>,
                synced_at: new Date().toISOString(),
              };
            });
          if (postRows.length > 0) {
            for (let i = 0; i < postRows.length; i += 200) {
              await sb
                .from('guesty_conversation_posts')
                .upsert(postRows.slice(i, i + 200), { onConflict: 'id' });
            }
          }

          const { latest, first, guestCount, hostCount } = extractGuestPosts(
            postsRes.posts || []
          );

          const latestText = latest ? postBodyText(latest).slice(0, 4000) : null;
          const firstText = first ? postBodyText(first).slice(0, 4000) : null;

          let classification: Record<string, unknown> | null = null;
          let classifiedAt: string | null = null;
          let inputHash: string | null = null;

          if (latestText) {
            const isInquiry = t.reservation_status === 'inquiry';
            const textToClassify = isInquiry ? firstText || latestText : latestText;
            inputHash = createHash('sha256')
              .update(`${t.reservation_status}::${textToClassify}`)
              .digest('hex');
            if (inputHash !== t.classification_input_hash) {
              try {
                if (isInquiry) {
                  const out = await classifyInquiry({
                    text: textToClassify,
                    listingName: t.listing_title || t.listing_nickname,
                    stayStart: t.reservation_check_in?.slice(0, 10),
                    stayEnd: t.reservation_check_out?.slice(0, 10),
                  });
                  if (out) {
                    classification = { kind: 'inquiry', ...out };
                    classifiedAt = new Date().toISOString();
                    conversationsClassified += 1;
                  }
                } else {
                  const out = await classifyRequest({
                    text: textToClassify,
                    listingName: t.listing_title || t.listing_nickname,
                    checkIn: t.reservation_check_in,
                    checkOut: t.reservation_check_out,
                  });
                  if (out) {
                    classification = { kind: 'request', ...out };
                    classifiedAt = new Date().toISOString();
                    conversationsClassified += 1;
                  }
                }
              } catch {
                // classification errors are non-fatal — leave prior
                // classification intact; next sync will retry.
              }
            }
          }

          await sb
            .from('guesty_conversations')
            .update({
              first_guest_post_text: firstText,
              first_guest_post_at: first ? first.createdAt : null,
              latest_guest_post_text: latestText,
              latest_guest_post_at: latest ? latest.createdAt : null,
              guest_post_count: guestCount,
              host_post_count: hostCount,
              posts_synced_at: new Date().toISOString(),
              ...(classification && {
                classification,
                classification_input_hash: inputHash,
                classified_at: classifiedAt,
              }),
            })
            .eq('id', t.id);
        } catch {
          // Per-conversation errors shouldn't abort the whole sync.
        }
      }
    }

    await sb
      .from('guesty_sync_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'succeeded',
        listings_synced: listingsSynced,
        reservations_synced: reservationsSynced,
        reviews_synced: reviewsSynced,
        conversations_synced: conversationsSynced,
        conversation_posts_fetched: conversationPostsFetched,
        conversations_classified: conversationsClassified,
      })
      .eq('id', runId);

    return {
      ok: true,
      run_id: runId,
      listings_synced: listingsSynced,
      reservations_synced: reservationsSynced,
      reviews_synced: reviewsSynced,
      conversations_synced: conversationsSynced,
      conversation_posts_fetched: conversationPostsFetched,
      conversations_classified: conversationsClassified,
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await sb
      .from('guesty_sync_runs')
      .update({
        finished_at: new Date().toISOString(),
        status: 'failed',
        error: msg,
        listings_synced: listingsSynced,
        reservations_synced: reservationsSynced,
        reviews_synced: reviewsSynced,
        conversations_synced: conversationsSynced,
        conversation_posts_fetched: conversationPostsFetched,
        conversations_classified: conversationsClassified,
      })
      .eq('id', runId);
    return { ok: false, error: msg };
  }
}

// Strip HTML tags + decode basic entities for email-channel message
// bodies. Good enough for classification — never shown raw to users.
function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Extract the readable text out of a post. airbnb2 / sms / whatsapp
// channels put plain text in `body`; email posts put HTML in `body` and
// a stripped copy in `plainTextBody`.
function postBodyText(p: GuestyConversationPost): string {
  if (typeof p.plainTextBody === 'string' && p.plainTextBody.trim()) {
    return p.plainTextBody.trim();
  }
  if (typeof p.body === 'string' && p.body.trim()) {
    const mt = p.module?.type;
    if (mt === 'email' || /<[a-zA-Z][^>]*>/.test(p.body)) {
      return htmlToText(p.body);
    }
    return p.body.trim();
  }
  return '';
}

// Partition a posts response (newest-first) into guest + host sides and
// return the first/latest real guest message (skipping log events and
// automated templates).
function extractGuestPosts(posts: GuestyConversationPost[]): {
  guestCount: number;
  hostCount: number;
  latest: GuestyConversationPost | null;
  first: GuestyConversationPost | null;
} {
  const guest = posts.filter(p => {
    const sentBy = p.sentBy;
    const fromType = p.from?.type;
    const moduleType = p.module?.type;
    if (moduleType === 'log') return false;
    if (p.isAutomatic === true) return false;
    const isGuest = sentBy === 'guest' || fromType === 'guest';
    if (!isGuest) return false;
    return postBodyText(p).length > 0;
  });
  const host = posts.filter(p => {
    const sentBy = p.sentBy;
    const fromType = p.from?.type;
    return sentBy === 'host' || fromType === 'employee';
  });
  return {
    guestCount: guest.length,
    hostCount: host.length,
    latest: guest[0] || null,
    first: guest[guest.length - 1] || null,
  };
}

function extractBuildingFromTags(tags: string[] | undefined): string | null {
  if (!Array.isArray(tags)) return null;
  for (const t of tags) {
    const m = String(t || '')
      .toUpperCase()
      .match(/^BH-?([A-Z0-9]+)$/);
    if (m) return `BH-${m[1]}`;
  }
  return null;
}

// Flatten one /communication/conversations row into our mirror schema.
// Denormalizes the first reservation (most conversations only have one).
function normalizeConversationRow(
  c: GuestyConversation
): Record<string, unknown> {
  const state = c.state || {};
  const lastFrom = c.lastMessageFrom || {};
  const guest = c.meta?.guest || {};
  const primary = c.meta?.reservations?.[0] || {};
  const listing = primary.listing || {};

  const listingBuilding =
    extractBuildingFromTags(listing.tags) ||
    extractBuildingCode(
      typeof listing.nickname === 'string' ? listing.nickname : null
    );

  return {
    id: String(c._id),
    account_id: typeof c.accountId === 'string' ? c.accountId : null,
    priority: typeof c.priority === 'number' ? c.priority : null,
    state_status: typeof state.status === 'string' ? state.status : null,
    state_read: typeof state.read === 'boolean' ? state.read : null,
    assignee_id:
      typeof c.assignee?._id === 'string' ? c.assignee._id : null,
    last_message_user_at: toTs(lastFrom.user),
    last_message_nonuser_at: toTs(lastFrom.nonUser),
    guest_id: typeof guest._id === 'string' ? guest._id : null,
    guest_full_name:
      typeof guest.fullName === 'string' ? guest.fullName : null,
    guest_email: typeof guest.email === 'string' ? guest.email : null,
    guest_phone: typeof guest.phone === 'string' ? guest.phone : null,
    guest_is_returning:
      typeof guest.isReturning === 'boolean' ? guest.isReturning : null,
    guest_contact_type:
      typeof guest.contactType === 'string' ? guest.contactType : null,
    reservation_id:
      typeof primary._id === 'string' ? primary._id : null,
    reservation_source:
      typeof primary.source === 'string' ? primary.source : null,
    reservation_status:
      typeof primary.status === 'string' ? primary.status : null,
    reservation_confirmation_code:
      typeof primary.confirmationCode === 'string'
        ? primary.confirmationCode
        : null,
    reservation_check_in: toTs(primary.checkIn),
    reservation_check_out: toTs(primary.checkOut),
    listing_id: typeof listing._id === 'string' ? listing._id : null,
    listing_nickname:
      typeof listing.nickname === 'string' ? listing.nickname : null,
    listing_title: typeof listing.title === 'string' ? listing.title : null,
    listing_building_code: listingBuilding,
    listing_tags: Array.isArray(listing.tags) ? listing.tags : [],
    created_at_guesty: toTs(c.createdAt),
    modified_at_guesty: toTs(c.modifiedAt),
    raw: (c as unknown) as Record<string, unknown>,
    synced_at: new Date().toISOString(),
  };
}
