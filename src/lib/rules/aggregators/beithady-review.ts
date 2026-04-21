import { anthropic, HAIKU } from '@/lib/anthropic';
import { classifyBuilding } from './beithady-booking';

export type ParsedAirbnbReview = {
  guest_name: string;
  rating: number;
  review_text: string | null;
  listing_name: string | null;
  stay_start: string | null;
  stay_end: string | null;
};

export type ReviewActionPlan = {
  category:
    | 'cleanliness'
    | 'noise'
    | 'staff'
    | 'amenities'
    | 'check_in'
    | 'location'
    | 'value'
    | 'communication'
    | 'other';
  priority: 'high' | 'medium' | 'low';
  root_cause: string;
  suggested_response: string;
  internal_action: string;
};

export type ReviewBuildingBucket = {
  key: string;
  review_count: number;
  avg_rating: number;
  low_rating_count: number;
  five_star_count: number;
};

export type ReviewMonthBucket = {
  month: string;
  label: string;
  count: number;
  avg_rating: number;
};

export type FlaggedReview = ParsedAirbnbReview & {
  email_date: string | null;
  building_code: string | null;
  action_plan: ReviewActionPlan | null;
};

export type BeithadyReviewAggregate = {
  email_count: number;
  parse_errors: number;
  parse_failures: Array<{ subject: string; from: string; reason: string }>;
  total_reviews: number;
  avg_rating: number;
  rating_histogram: Record<'1' | '2' | '3' | '4' | '5', number>;
  low_rating_count: number;
  five_star_count: number;
  action_plan_errors: number;
  by_building: ReviewBuildingBucket[];
  by_month: ReviewMonthBucket[];
  top_building: ReviewBuildingBucket | null;
  worst_building: ReviewBuildingBucket | null;
  flagged_reviews: FlaggedReview[];
  reviews: Array<
    ParsedAirbnbReview & { email_date: string | null; building_code: string | null }
  >;
};

const REVIEW_SYSTEM = `You parse Airbnb guest-review notification emails relayed through Guesty to guesty@beithady.com.

Typical shape:
  Subject: "Charlie left a 5-star review!" (or 1/2/3/4/5 stars)
  From: "service via Guesty"
  Body: Listing name line (e.g. "Luxury 3BR - Near EDNC - 247 Front Desk & Security"), stay dates (e.g. "Apr 14 - 15, 2026"), "Overall rating: N", a short label (Great/Good/Okay/Poor/Terrible), then a "Read full review" button and "Write a response" button.

Rules:
- Extract guest_name from the subject (the name before "left a").
- Extract rating as the integer 1-5 from the subject or the "Overall rating: N" line.
- review_text: in most cases the email does NOT contain the actual review text (guests can still edit it for 48h, so the email only links to "Read full review"). If the body shows a short label like "Great"/"Good"/"Okay"/"Poor"/"Terrible", treat that as the rating label, NOT the review text — leave review_text null. Only populate review_text if an actual multi-word guest-written review is present inline.
- listing_name: the name of the rental unit as shown in the email (strip any trailing "Apr 14 - 15, 2026" date fragment).
- stay_start / stay_end: ISO YYYY-MM-DD if the stay dates can be parsed unambiguously. Otherwise null.
- If the email is NOT a guest review notification (e.g. "Review your upcoming stay", "Time to review Charlie", host-side review prompts, marketing digests about reviews), return nothing — omit the tool call entirely.`;

const REVIEW_TOOL = {
  name: 'extract_airbnb_review',
  description: 'Parse an Airbnb guest review-notification email.',
  input_schema: {
    type: 'object' as const,
    properties: {
      guest_name: { type: 'string' },
      rating: { type: 'number', description: 'Integer 1-5.' },
      review_text: { type: ['string', 'null'] },
      listing_name: { type: ['string', 'null'] },
      stay_start: { type: ['string', 'null'] },
      stay_end: { type: ['string', 'null'] },
    },
    required: ['guest_name', 'rating'],
  },
};

const ACTION_PLAN_SYSTEM = `You help a short-term-rental host respond to a negative Airbnb guest review and plan an internal fix.

You will receive: listing name, stay dates, rating (1-3 stars), and optionally the review text.

Output:
- category: single best label (cleanliness / noise / staff / amenities / check_in / location / value / communication / other)
- priority: high (rating 1-2 or mentions safety/hygiene/cheating) / medium (rating 3) / low (otherwise)
- root_cause: one-sentence hypothesis for WHY the guest had this experience, based on rating + text if available. If text is absent, reason from the rating alone ("1-star with no text often signals a service failure requiring follow-up").
- suggested_response: a short 2-3 sentence public reply the host can post on Airbnb. Tone: empathetic, specific, no boilerplate. Apologize for the specific issue if known; thank them for feedback; note the fix.
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

async function parseAirbnbReview(
  subject: string,
  bodyText: string
): Promise<ParsedAirbnbReview | null> {
  const trimmed = bodyText.length > 10000 ? bodyText.slice(0, 10000) : bodyText;
  const content = `SUBJECT: ${subject}\n\n${trimmed}`;
  const res = await anthropic().messages.create({
    model: HAIKU,
    max_tokens: 800,
    system: [
      { type: 'text', text: REVIEW_SYSTEM, cache_control: { type: 'ephemeral' } },
    ],
    tools: [REVIEW_TOOL],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content }],
  });
  const toolUse = res.content.find(b => b.type === 'tool_use');
  if (!toolUse || toolUse.type !== 'tool_use') return null;
  const raw = toolUse.input as Record<string, unknown>;
  const rawRating = Number(raw.rating);
  if (!Number.isFinite(rawRating) || rawRating < 1 || rawRating > 5) return null;
  return {
    guest_name: String(raw.guest_name || '').trim() || 'Unknown',
    rating: Math.round(rawRating),
    review_text: raw.review_text ? String(raw.review_text).trim() || null : null,
    listing_name: raw.listing_name ? String(raw.listing_name).trim() : null,
    stay_start: raw.stay_start ? String(raw.stay_start) : null,
    stay_end: raw.stay_end ? String(raw.stay_end) : null,
  };
}

async function suggestActionPlan(
  review: ParsedAirbnbReview
): Promise<ReviewActionPlan | null> {
  const content = [
    `LISTING: ${review.listing_name || 'unknown'}`,
    `STAY: ${review.stay_start || '?'} → ${review.stay_end || '?'}`,
    `RATING: ${review.rating}/5`,
    `REVIEW TEXT: ${review.review_text || '(not included in email — email only shows the star rating; guest has 48h to finalize text)'}`,
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

function buildingFromListing(listing: string | null | undefined): string | null {
  if (!listing) return null;
  const m = listing.match(/\bBH[-\s]?[A-Z0-9]+\b/i);
  if (m) return classifyBuilding(m[0].replace(/\s+/g, ''));
  // Airbnb listing names usually don't carry the BH- code — tag by building name cues.
  const lower = listing.toLowerCase();
  if (lower.includes('ednc') || lower.includes('new cairo') || lower.includes('kattameya'))
    return 'BH-OK';
  if (lower.includes('heliopolis') || lower.includes('merghany')) return 'BH-MG';
  return null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function aggregateBeithadyReviews(
  bodies: Array<{
    subject: string;
    from: string;
    bodyText: string;
    receivedIso: string | null;
  }>
): Promise<BeithadyReviewAggregate> {
  const settled = await Promise.allSettled(
    bodies.map(b => parseAirbnbReview(b.subject, b.bodyText))
  );

  type ParsedEntry = { parsed: ParsedAirbnbReview; receivedIso: string | null };
  const parsed: ParsedEntry[] = [];
  const failures: BeithadyReviewAggregate['parse_failures'] = [];
  let parseErrors = 0;

  for (let i = 0; i < settled.length; i++) {
    const r = settled[i];
    const src = bodies[i];
    if (r.status === 'fulfilled' && r.value) {
      parsed.push({ parsed: r.value, receivedIso: src.receivedIso });
    } else if (r.status === 'rejected') {
      parseErrors++;
      failures.push({
        subject: src.subject.slice(0, 200),
        from: src.from.slice(0, 200),
        reason: String(
          (r as PromiseRejectedResult).reason?.message ||
            (r as PromiseRejectedResult).reason ||
            'rejected'
        ).slice(0, 300),
      });
    }
    // fulfilled-null = non-review email, silent skip
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
  let ratingSum = 0;
  let lowCount = 0;
  let fiveStarCount = 0;
  const flaggedSources: Array<ParsedEntry & { building: string | null }> = [];
  const reviewsOut: BeithadyReviewAggregate['reviews'] = [];

  for (const e of parsed) {
    const p = e.parsed;
    const r = Math.max(1, Math.min(5, Math.round(p.rating)));
    histogram[String(r) as '1' | '2' | '3' | '4' | '5'] += 1;
    ratingSum += r;
    if (r < 3) lowCount += 1;
    if (r === 5) fiveStarCount += 1;

    const building = buildingFromListing(p.listing_name);
    reviewsOut.push({
      ...p,
      rating: r,
      email_date: e.receivedIso,
      building_code: building,
    });
    if (r < 3) flaggedSources.push({ ...e, building });

    const bKey = building || 'UNKNOWN';
    const b = buildingMap.get(bKey);
    if (b) {
      b.sum += r;
      b.count += 1;
      if (r < 3) b.low += 1;
      if (r === 5) b.five += 1;
    } else {
      buildingMap.set(bKey, {
        sum: r,
        count: 1,
        low: r < 3 ? 1 : 0,
        five: r === 5 ? 1 : 0,
      });
    }

    if (e.receivedIso) {
      const d = new Date(e.receivedIso);
      if (!Number.isNaN(d.getTime())) {
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
        const label = d.toLocaleString(undefined, {
          month: 'short',
          year: 'numeric',
          timeZone: 'UTC',
        });
        const m = monthMap.get(key);
        if (m) {
          m.sum += r;
          m.count += 1;
        } else {
          monthMap.set(key, { sum: r, count: 1, label });
        }
      }
    }
  }

  const totalReviews = parsed.length;
  const avgRating = totalReviews > 0 ? round2(ratingSum / totalReviews) : 0;

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
      building_code: f.building,
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

  // Best/worst require at least 2 reviews to be meaningful; otherwise any
  // single 5-star review trivially "wins" for that building.
  const meaningful = byBuilding.filter(b => b.review_count >= 2);
  const topBuilding = meaningful.length
    ? meaningful.reduce((a, b) => (a.avg_rating >= b.avg_rating ? a : b))
    : null;
  const worstBuilding = meaningful.length
    ? meaningful.reduce((a, b) => (a.avg_rating <= b.avg_rating ? a : b))
    : null;

  return {
    email_count: bodies.length,
    parse_errors: parseErrors,
    parse_failures: failures,
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
  };
}
