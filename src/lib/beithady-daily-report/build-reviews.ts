import 'server-only';
import { supabaseAdmin } from '../supabase';
import { anthropic, HAIKU } from '../anthropic';
import { addDays, type MonthRange } from './cairo-dates';
import { bucketFromGuestyListing } from './units';
import {
  BUILDING_CODES,
  type BuildingCode,
  type ReviewSummary,
  type ReviewsSection,
} from './types';
import { normalizeChannel } from './reservations';

// Reviews section. Pulls from `guesty_reviews` (mirror) and runs the
// last-24h reviews through Claude Haiku for one-line summaries. Older
// reviews only contribute to the count + star distribution; they don't
// need AI summaries.

type ReviewRow = {
  id: string;
  channel_id: string | null;
  reservation_id: string | null;
  listing_id: string | null;
  reviewer_role: string | null;
  overall_rating: number | null;
  public_review: string | null;
  hidden: boolean | null;
  submitted: boolean | null;
  created_at_guesty: string | null;
  listing: { nickname: string | null; building_code: string | null } | null;
};

async function summarizeWithHaiku(text: string): Promise<string> {
  // Falls back to a truncation if the API key is missing or call fails —
  // we never want to fail the whole report over a single review summary.
  if (!text || text.trim().length === 0) return '';
  if (!process.env.ANTHROPIC_API_KEY) {
    return text.slice(0, 200);
  }
  try {
    const resp = await anthropic().messages.create({
      model: HAIKU,
      max_tokens: 60,
      system:
        'You are a hospitality operations analyst. Summarize a guest review in ONE concise sentence (max 20 words) that captures the sentiment and any specific issues or praise. Do not add quotes, opinions, or padding. Plain text only.',
      messages: [
        { role: 'user', content: `Guest review:\n${text.trim().slice(0, 2000)}` },
      ],
    });
    const block = resp.content.find(b => b.type === 'text');
    if (block && block.type === 'text') {
      return block.text.trim().replace(/^["']|["']$/g, '').slice(0, 200);
    }
  } catch {
    // fall through
  }
  return text.slice(0, 200);
}

export async function buildReviewsSection(
  ctx: MonthRange
): Promise<{ section: ReviewsSection; warnings: string[] }> {
  const sb = supabaseAdmin();
  const warnings: string[] = [];
  const monthStartIso = `${ctx.start}T00:00:00Z`;
  const last24Iso = `${addDays(ctx.today, -1)}T00:00:00Z`;

  const { data, error } = await sb
    .from('guesty_reviews')
    .select(
      `id, channel_id, reservation_id, listing_id, reviewer_role,
       overall_rating, public_review, hidden, submitted, created_at_guesty,
       listing:guesty_listings!left(nickname, building_code)`
    )
    .gte('created_at_guesty', monthStartIso)
    .order('created_at_guesty', { ascending: false })
    .limit(500);

  if (error) {
    warnings.push(`reviews_query_failed: ${error.message}`);
    return {
      section: emptySection(),
      warnings,
    };
  }

  const rows = ((data || []) as unknown as ReviewRow[]).filter(r => {
    // Mirror the existing aggregator's filter: guest-side reviews only,
    // not hidden, submitted.
    if ((r.reviewer_role || '').toLowerCase() !== 'guest') return false;
    if (r.hidden === true) return false;
    if (r.submitted === false) return false;
    return true;
  });

  // Star distribution + per-building counts
  const starCounts = new Map<1 | 2 | 3 | 4 | 5, number>([
    [1, 0], [2, 0], [3, 0], [4, 0], [5, 0],
  ]);
  const perBuilding = new Map<BuildingCode, number>(
    BUILDING_CODES.map(b => [b, 0])
  );
  let ratingSum = 0;
  let ratingN = 0;

  for (const r of rows) {
    const rating = typeof r.overall_rating === 'number' ? r.overall_rating : null;
    if (rating != null && rating >= 1 && rating <= 5) {
      const k = Math.round(rating) as 1 | 2 | 3 | 4 | 5;
      starCounts.set(k, (starCounts.get(k) || 0) + 1);
      ratingSum += rating;
      ratingN += 1;
    }
    const bucket = bucketFromGuestyListing({
      building_code: r.listing?.building_code || null,
      id: r.listing_id || undefined,
    });
    perBuilding.set(bucket, (perBuilding.get(bucket) || 0) + 1);
  }

  // Last-24h with AI summaries (parallel, capped to 25 to bound cost)
  const recent = rows.filter(r => (r.created_at_guesty || '') >= last24Iso).slice(0, 25);
  const last24h: ReviewSummary[] = await Promise.all(
    recent.map(async r => {
      const text = r.public_review || '';
      const summary = await summarizeWithHaiku(text);
      const channel = normalizeChannel(r.channel_id);
      const unit = r.listing?.nickname || r.listing?.building_code || 'Unknown';
      const rating =
        typeof r.overall_rating === 'number' ? r.overall_rating : null;
      return {
        reservation_id: r.reservation_id,
        unit,
        channel,
        rating,
        raw_text: text.slice(0, 500),
        ai_summary: summary,
        flagged: rating != null && rating < 4,
        created_at: r.created_at_guesty || '',
      };
    })
  );

  return {
    section: {
      count_mtd: rows.length,
      avg_rating_mtd: ratingN > 0 ? Math.round((ratingSum / ratingN) * 10) / 10 : 0,
      star_distribution: ([5, 4, 3, 2, 1] as const).map(s => ({
        stars: s,
        count: starCounts.get(s) || 0,
      })),
      per_building_count: BUILDING_CODES.map(b => ({
        building: b,
        count: perBuilding.get(b) || 0,
      })),
      last_24h: last24h,
    },
    warnings,
  };
}

function emptySection(): ReviewsSection {
  return {
    count_mtd: 0,
    avg_rating_mtd: 0,
    star_distribution: [
      { stars: 5, count: 0 },
      { stars: 4, count: 0 },
      { stars: 3, count: 0 },
      { stars: 2, count: 0 },
      { stars: 1, count: 0 },
    ],
    per_building_count: BUILDING_CODES.map(b => ({ building: b, count: 0 })),
    last_24h: [],
  };
}
