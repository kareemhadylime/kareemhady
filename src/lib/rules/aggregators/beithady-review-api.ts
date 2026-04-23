// API-based Beithady review aggregator. Replaces the email-parsing path
// in beithady-review.ts — reads directly from the `guesty_reviews` mirror
// table (populated by src/lib/run-guesty-sync.ts hitting /v1/reviews).
//
// The API gives us richer data than the email parser ever could:
//   - Overall rating (1-5) — exact, not guessed
//   - Full review text when submitted
//   - Per-category ratings (cleanliness, accuracy, checkin, communication,
//     location, value) + Airbnb tag codes like
//     GUEST_REVIEW_HOST_POSITIVE_SPOTLESS_FURNITURE_AND_LINENS
//   - Reviewer role (guest / host) — filter to guest→host reviews only
//   - Channel (airbnb2 / booking / ...) — first-class, not inferred
//
// We keep the existing BeithadyReviewAggregate output shape so the
// /emails/beithady/[ruleId] page renders unchanged, and extend it with
// category-level aggregates under optional fields.

import { supabaseAdmin } from '@/lib/supabase';
import { anthropic, HAIKU } from '@/lib/anthropic';
import type {
  BeithadyReviewAggregate,
  FlaggedReview,
  ParsedAirbnbReview,
  ReviewActionPlan,
  ReviewBuildingBucket,
  ReviewMonthBucket,
} from './beithady-review';

const round2 = (n: number) => Math.round(n * 100) / 100;

type CategoryRating = {
  category?: string;
  rating?: number;
  review_category_tags?: string[];
};

type ReviewRow = {
  id: string;
  channel_id: string | null;
  external_reservation_id: string | null;
  guest_id: string | null;
  reviewer_role: string | null;
  overall_rating: number | null;
  public_review: string | null;
  category_ratings: CategoryRating[] | null;
  submitted: boolean | null;
  hidden: boolean | null;
  created_at_guesty: string | null;
  created_at_source: string | null;
  listing: {
    nickname: string | null;
    title: string | null;
    building_code: string | null;
  } | null;
  reservation: {
    guest_name: string | null;
    check_in_date: string | null;
    check_out_date: string | null;
  } | null;
};

export type CategoryRatingBucket = {
  category: string;
  review_count: number;
  avg_rating: number;
  top_positive_tags: Array<{ tag: string; count: number }>;
  top_negative_tags: Array<{ tag: string; count: number }>;
};

export type BeithadyReviewAggregateApi = BeithadyReviewAggregate & {
  by_category: CategoryRatingBucket[];
  by_channel: Array<{
    channel: string;
    review_count: number;
    avg_rating: number;
    low_rating_count: number;
    five_star_count: number;
  }>;
  source: 'guesty-api';
};

const ACTION_PLAN_SYSTEM = `You help a short-term-rental host respond to a negative Airbnb guest review and plan an internal fix.

You will receive: listing name, stay dates, rating (1-3 stars), and optionally the review text.

Output:
- category: single best label (cleanliness / noise / staff / amenities / check_in / location / value / communication / other)
- priority: high (rating 1-2 or mentions safety/hygiene/cheating) / medium (rating 3) / low (otherwise)
- root_cause: one-sentence hypothesis for WHY the guest had this experience, based on rating + text if available. If text is absent, reason from the rating alone ("1-star with no text often signals a service failure requiring follow-up").
- suggested_response: a short 2-3 sentence public reply the host can post on Airbnb. Tone: empathetic, specific, no boilerplate.
- internal_action: one concrete operational action the host should take (e.g. "Brief cleaning crew on bathroom checklist for this unit", "Review check-in instructions clarity with front desk").`;

const ACTION_PLAN_TOOL = {
  name: 'suggest_review_action_plan',
  description: 'Suggest a structured action plan for a flagged low-rated review.',
  input_schema: {
    type: 'object' as const,
    properties: {
      category: {
        type: 'string',
        enum: [
          'cleanliness',
          'noise',
          'staff',
          'amenities',
          'check_in',
          'location',
          'value',
          'communication',
          'other',
        ],
      },
      priority: { type: 'string', enum: ['high', 'medium', 'low'] },
      root_cause: { type: 'string' },
      suggested_response: { type: 'string' },
      internal_action: { type: 'string' },
    },
    required: [
      'category',
      'priority',
      'root_cause',
      'suggested_response',
      'internal_action',
    ],
  },
};

async function suggestActionPlan(
  review: ParsedAirbnbReview
): Promise<ReviewActionPlan | null> {
  const content = [
    `LISTING: ${review.listing_name || 'unknown'}`,
    `STAY: ${review.stay_start || '?'} → ${review.stay_end || '?'}`,
    `RATING: ${review.rating}/5`,
    `REVIEW TEXT: ${review.review_text || '(not included)'}`,
  ].join('\n');
  const res = await anthropic().messages.create({
    model: HAIKU,
    max_tokens: 700,
    system: [
      { type: 'text', text: ACTION_PLAN_SYSTEM, cache_control: { type: 'ephemeral' } },
    ],
    tools: [ACTION_PLAN_TOOL],
    tool_choice: { type: 'tool', name: 'suggest_review_action_plan' },
    messages: [{ role: 'user', content }],
  });
  const toolUse = res.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') return null;
  const raw = toolUse.input as Record<string, unknown>;
  return {
    category: (String(raw.category || 'other') as ReviewActionPlan['category']),
    priority: (String(raw.priority || 'medium') as ReviewActionPlan['priority']),
    root_cause: String(raw.root_cause || '').trim(),
    suggested_response: String(raw.suggested_response || '').trim(),
    internal_action: String(raw.internal_action || '').trim(),
  };
}

// Map raw channelId to a human label.
function normalizeChannel(channelId: string | null): string {
  const raw = String(channelId || '').toLowerCase();
  if (raw.startsWith('airbnb')) return 'Airbnb';
  if (raw.startsWith('booking')) return 'Booking.com';
  if (raw.startsWith('vrbo') || raw.startsWith('homeaway')) return 'Vrbo';
  if (raw) return raw.replace(/\b\w/g, c => c.toUpperCase());
  return 'Unknown';
}

export async function aggregateBeithadyReviewsFromApi(
  fromIso: string,
  toIso: string
): Promise<BeithadyReviewAggregateApi> {
  const sb = supabaseAdmin();

  // Only guest→host reviews land in the dashboard; host→guest reviews are
  // for ops reference but shouldn't show up in the building rating avg.
  const rows: ReviewRow[] = [];
  const PAGE = 1000;
  for (let offset = 0; offset < 100000; offset += PAGE) {
    const { data, error } = await sb
      .from('guesty_reviews')
      .select(
        `id, channel_id, external_reservation_id, guest_id, reviewer_role,
         overall_rating, public_review, category_ratings, submitted, hidden,
         created_at_guesty, created_at_source,
         listing:guesty_listings!left(nickname, title, building_code),
         reservation:guesty_reservations!left(guest_name, check_in_date, check_out_date)`
      )
      .eq('reviewer_role', 'guest')
      .gte('created_at_guesty', fromIso)
      .lt('created_at_guesty', toIso)
      .order('created_at_guesty', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`guesty_reviews_query_failed: ${error.message}`);
    const batch = (data as unknown as ReviewRow[]) || [];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }

  const histogram: Record<'1' | '2' | '3' | '4' | '5', number> = {
    '1': 0,
    '2': 0,
    '3': 0,
    '4': 0,
    '5': 0,
  };
  const buildingMap = new Map<
    string,
    { sum: number; count: number; low: number; five: number }
  >();
  const monthMap = new Map<string, { sum: number; count: number; label: string }>();
  const channelMap = new Map<
    string,
    { sum: number; count: number; low: number; five: number }
  >();
  const categoryAccum = new Map<
    string,
    {
      sum: number;
      count: number;
      tagCounts: Map<string, number>;
    }
  >();

  let ratingSum = 0;
  let lowCount = 0;
  let fiveStarCount = 0;

  type ParsedEntry = {
    parsed: ParsedAirbnbReview;
    receivedIso: string | null;
    buildingCode: string | null;
  };
  const reviewsOut: BeithadyReviewAggregate['reviews'] = [];
  const flaggedSources: ParsedEntry[] = [];

  for (const r of rows) {
    const rating =
      typeof r.overall_rating === 'number'
        ? Math.max(1, Math.min(5, Math.round(r.overall_rating)))
        : null;
    if (rating == null) continue;

    // Hidden / unsubmitted reviews — Guesty keeps them around. Drop so the
    // dashboard reflects only reviews the public can actually see.
    if (r.hidden === true) continue;
    if (r.submitted === false) continue;

    histogram[String(rating) as '1' | '2' | '3' | '4' | '5'] += 1;
    ratingSum += rating;
    if (rating < 3) lowCount += 1;
    if (rating === 5) fiveStarCount += 1;

    const building = r.listing?.building_code || null;
    const bKey = building || 'UNKNOWN';
    const b = buildingMap.get(bKey);
    if (b) {
      b.sum += rating;
      b.count += 1;
      if (rating < 3) b.low += 1;
      if (rating === 5) b.five += 1;
    } else {
      buildingMap.set(bKey, {
        sum: rating,
        count: 1,
        low: rating < 3 ? 1 : 0,
        five: rating === 5 ? 1 : 0,
      });
    }

    const channel = normalizeChannel(r.channel_id);
    const ch = channelMap.get(channel);
    if (ch) {
      ch.sum += rating;
      ch.count += 1;
      if (rating < 3) ch.low += 1;
      if (rating === 5) ch.five += 1;
    } else {
      channelMap.set(channel, {
        sum: rating,
        count: 1,
        low: rating < 3 ? 1 : 0,
        five: rating === 5 ? 1 : 0,
      });
    }

    const createdIso = r.created_at_source || r.created_at_guesty || null;
    if (createdIso) {
      const d = new Date(createdIso);
      if (!Number.isNaN(d.getTime())) {
        const key = `${d.getUTCFullYear()}-${String(
          d.getUTCMonth() + 1
        ).padStart(2, '0')}`;
        const label = d.toLocaleString(undefined, {
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        });
        const m = monthMap.get(key);
        if (m) {
          m.sum += rating;
          m.count += 1;
        } else {
          monthMap.set(key, { sum: rating, count: 1, label });
        }
      }
    }

    // Per-category accumulation
    const cats = Array.isArray(r.category_ratings) ? r.category_ratings : [];
    for (const c of cats) {
      const cat = String(c?.category || '').trim().toLowerCase();
      const cr =
        typeof c?.rating === 'number'
          ? Math.max(1, Math.min(5, Math.round(c.rating)))
          : null;
      if (!cat || cr == null) continue;
      const entry = categoryAccum.get(cat) || {
        sum: 0,
        count: 0,
        tagCounts: new Map<string, number>(),
      };
      entry.sum += cr;
      entry.count += 1;
      const tags = Array.isArray(c.review_category_tags)
        ? c.review_category_tags
        : [];
      for (const t of tags) {
        if (typeof t !== 'string' || !t) continue;
        entry.tagCounts.set(t, (entry.tagCounts.get(t) || 0) + 1);
      }
      categoryAccum.set(cat, entry);
    }

    const listingName =
      r.listing?.title || r.listing?.nickname || null;
    const parsed: ParsedAirbnbReview = {
      guest_name: r.reservation?.guest_name || 'Guest',
      rating,
      review_text: r.public_review || null,
      listing_name: listingName,
      stay_start: r.reservation?.check_in_date || null,
      stay_end: r.reservation?.check_out_date || null,
    };
    reviewsOut.push({
      ...parsed,
      email_date: createdIso,
      building_code: building,
    });
    if (rating < 3) {
      flaggedSources.push({
        parsed,
        receivedIso: createdIso,
        buildingCode: building,
      });
    }
  }

  const totalReviews = reviewsOut.length;
  const avgRating = totalReviews > 0 ? round2(ratingSum / totalReviews) : 0;

  // Action plans only for flagged low-rated reviews. Parallel Claude calls.
  const planSettled = await Promise.allSettled(
    flaggedSources.map(f => suggestActionPlan(f.parsed))
  );
  let actionPlanErrors = 0;
  const flagged: FlaggedReview[] = flaggedSources.map((f, i) => {
    const r = planSettled[i];
    let plan: ReviewActionPlan | null = null;
    if (r.status === 'fulfilled') plan = r.value;
    else actionPlanErrors += 1;
    return {
      ...f.parsed,
      email_date: f.receivedIso,
      building_code: f.buildingCode,
      action_plan: plan,
    };
  });

  const byBuilding: ReviewBuildingBucket[] = Array.from(buildingMap.entries())
    .map(([key, v]) => ({
      key,
      review_count: v.count,
      avg_rating: round2(v.sum / v.count),
      low_rating_count: v.low,
      five_star_count: v.five,
    }))
    .sort((a, b) => b.avg_rating - a.avg_rating);

  const byMonth: ReviewMonthBucket[] = Array.from(monthMap.entries())
    .map(([month, v]) => ({
      month,
      label: v.label,
      count: v.count,
      avg_rating: round2(v.sum / v.count),
    }))
    .sort((a, b) => a.month.localeCompare(b.month));

  const byChannel = Array.from(channelMap.entries())
    .map(([channel, v]) => ({
      channel,
      review_count: v.count,
      avg_rating: round2(v.sum / v.count),
      low_rating_count: v.low,
      five_star_count: v.five,
    }))
    .sort((a, b) => b.review_count - a.review_count);

  const meaningful = byBuilding.filter(b => b.review_count >= 2);
  const topBuilding = meaningful.length
    ? meaningful.reduce((a, b) => (a.avg_rating >= b.avg_rating ? a : b))
    : null;
  const worstBuilding = meaningful.length
    ? meaningful.reduce((a, b) => (a.avg_rating <= b.avg_rating ? a : b))
    : null;

  const byCategory: CategoryRatingBucket[] = Array.from(categoryAccum.entries())
    .map(([category, v]) => {
      const sortedTags = Array.from(v.tagCounts.entries()).sort(
        (a, b) => b[1] - a[1]
      );
      const positives = sortedTags.filter(([t]) => t.includes('POSITIVE'));
      const negatives = sortedTags.filter(([t]) => t.includes('NEGATIVE'));
      return {
        category,
        review_count: v.count,
        avg_rating: round2(v.sum / v.count),
        top_positive_tags: positives.slice(0, 5).map(([tag, count]) => ({
          tag,
          count,
        })),
        top_negative_tags: negatives.slice(0, 5).map(([tag, count]) => ({
          tag,
          count,
        })),
      };
    })
    .sort((a, b) => a.avg_rating - b.avg_rating); // lowest-rated categories first (where to focus)

  return {
    email_count: 0, // no emails in the API path
    parse_errors: 0,
    parse_failures: [],
    total_reviews: totalReviews,
    avg_rating: avgRating,
    rating_histogram: histogram,
    low_rating_count: lowCount,
    five_star_count: fiveStarCount,
    action_plan_errors: actionPlanErrors,
    by_building: byBuilding,
    by_month: byMonth,
    top_building: topBuilding,
    worst_building: worstBuilding,
    flagged_reviews: flagged,
    reviews: reviewsOut,
    guesty_enriched_count: totalReviews,
    by_category: byCategory,
    by_channel: byChannel,
    source: 'guesty-api',
  };
}
