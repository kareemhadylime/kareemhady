import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';

const MODEL = 'claude-haiku-4-5-20251001';
const PROMPT_VERSION = 'v1';

let _client: Anthropic | null = null;
function getClient(): Anthropic {
  if (_client) return _client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');
  _client = new Anthropic({ apiKey });
  return _client;
}

export type ReviewForReply = {
  id: string;
  rating: number | null;
  text: string;
  reviewer_name: string | null;
  language_hint: string | null;
  listing_nickname: string | null;
  building_code: string | null;
  reservation_confirmation_code: string | null;
  channel: string | null;
};

export async function generateReviewReplyDraft(review: ReviewForReply): Promise<{
  language: string;
  draft: string;
  raw: unknown;
}> {
  const client = getClient();
  const prompt = buildPrompt(review);
  const res = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    temperature: 0.5,
    messages: [{ role: 'user', content: prompt }],
  });
  const text = res.content
    .map(b => (b.type === 'text' ? b.text : ''))
    .join('')
    .trim();
  const parsed = parseJsonish(text);
  return {
    language: typeof parsed?.language === 'string' ? parsed.language : (review.language_hint || 'en'),
    draft: typeof parsed?.draft === 'string' ? parsed.draft : text,
    raw: { full: text, parsed },
  };
}

function buildPrompt(r: ReviewForReply): string {
  const ratingTone = r.rating == null ? 'unrated' : r.rating >= 9 ? '5★ promoter' : r.rating >= 7 ? '4★ neutral' : 'detractor';
  return `You are the Beit Hady team writing a public reply to a guest review on ${r.channel || 'an OTA'}.

Detect the language of the review below and reply in the SAME language.
Tone: warm hospitality, professional, no over-the-top "thank you so much!". For high ratings (≥9): brief gratitude + invite back. For mid (7-8): brief gratitude + acknowledge any specific feedback if mentioned. For low (≤6): apologize for the specific issue, take responsibility, invite them to message us so we can make it right.

Hard rules:
- Sign off as "Beit Hady team"
- Never argue or get defensive — even on unfair reviews
- 2-4 sentences max
- No emojis (channels strip them anyway)
- If reviewer mentioned the building/unit by name, acknowledge it
- Do NOT promise discounts or refunds in a public reply

Review:
- Rating: ${r.rating ?? 'n/a'} (${ratingTone})
- Reviewer: ${r.reviewer_name || 'guest'}
- Listing: ${r.listing_nickname || r.building_code || 'Beit Hady apartment'}
- Channel: ${r.channel || 'unknown'}

Review text:
"""
${r.text.slice(0, 2000)}
"""

Respond ONLY with strict JSON:
{ "language": "<iso 639-1>", "draft": "<reply text in that language>" }`;
}

function parseJsonish(text: string): { language?: string; draft?: string } | null {
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* */ }
  const fenced = text.match(/```(?:json)?\s*([\s\S]+?)```/);
  if (fenced) { try { return JSON.parse(fenced[1].trim()); } catch { /* */ } }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) { try { return JSON.parse(m[0]); } catch { /* */ } }
  return null;
}

// Pull guesty_reviews + lazily-generate a draft for any review without
// a beithady_review_replies row. Cron-friendly batch processor.
//
// Schema note: the guesty_reviews table promotes `public_review` and
// `overall_rating` to top-level columns (not nested under a `raw_review`
// jsonb field — that's the legacy v1 shape). The full Guesty payload
// stays available on the `raw` jsonb column for fields we don't promote
// (e.g. `reservation_confirmation_code`). Time semantics: `synced_at`
// is always populated; `created_at_source` is when the guest left the
// review on the OTA (preferred for ordering when present).
export async function processReviewReplyQueue(maxNew = 20): Promise<{
  considered: number;
  drafted: number;
  errors: Array<{ review_id: string; error: string }>;
}> {
  const sb = supabaseAdmin();
  // Fetch the most recent reviews without a draft yet
  const { data: reviews, error: reviewsErr } = await sb
    .from('guesty_reviews')
    .select(
      'id, raw, channel_id, listing_id, reservation_id, overall_rating, public_review, created_at_source, created_at_guesty, synced_at',
    )
    .order('synced_at', { ascending: false })
    .limit(200);
  if (reviewsErr) {
    console.warn('[review-reply-queue] supabase error', reviewsErr.message);
    return { considered: 0, drafted: 0, errors: [] };
  }
  const all = (reviews as Array<{
    id: string;
    raw: Record<string, unknown> | null;
    channel_id: string | null;
    listing_id: string | null;
    reservation_id: string | null;
    overall_rating: number | null;
    public_review: string | null;
    created_at_source: string | null;
    created_at_guesty: string | null;
    synced_at: string | null;
  }> | null) || [];
  if (!all.length) return { considered: 0, drafted: 0, errors: [] };

  const ids = all.map(r => r.id);
  const { data: existing } = await sb
    .from('beithady_review_replies')
    .select('guesty_review_id')
    .in('guesty_review_id', ids);
  const haveDrafts = new Set(((existing as Array<{ guesty_review_id: string }> | null) || []).map(r => r.guesty_review_id));

  const todo = all.filter(r => !haveDrafts.has(r.id)).slice(0, maxNew);

  // Resolve listing nicknames for context
  const listingIds = Array.from(new Set(todo.map(r => r.listing_id).filter((x): x is string => !!x)));
  const listingMap = new Map<string, { nickname: string | null; building: string | null }>();
  if (listingIds.length) {
    const { data: listings } = await sb
      .from('guesty_listings')
      .select('id, nickname, building_code')
      .in('id', listingIds);
    for (const l of (listings as Array<{ id: string; nickname: string | null; building_code: string | null }> | null) || []) {
      listingMap.set(l.id, { nickname: l.nickname, building: l.building_code });
    }
  }

  let drafted = 0;
  const errors: Array<{ review_id: string; error: string }> = [];
  for (const r of todo) {
    const text = r.public_review || '';
    if (!text || text.trim().length < 10) continue;
    const rating = r.overall_rating;
    const raw = r.raw || {};
    const listing = r.listing_id ? listingMap.get(r.listing_id) : null;
    try {
      const result = await generateReviewReplyDraft({
        id: r.id,
        rating: rating != null ? Math.round(rating) : null,
        text,
        reviewer_name: null,
        language_hint: null,
        listing_nickname: listing?.nickname || null,
        building_code: listing?.building || null,
        reservation_confirmation_code: (raw.reservation_confirmation_code as string | null) || null,
        channel: r.channel_id,
      });
      await sb.from('beithady_review_replies').insert({
        guesty_review_id: r.id,
        language: result.language,
        rating: rating != null ? Math.round(rating) : null,
        reviewer_name: null,
        ai_draft: result.draft,
        prompt_version: PROMPT_VERSION,
        model: MODEL,
        raw: result.raw as object,
      });
      drafted++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ review_id: r.id, error: msg });
    }
  }

  await recordAudit({
    module: 'communication',
    action: 'review_reply_queue_run',
    metadata: { considered: todo.length, drafted, error_count: errors.length },
  });

  return { considered: todo.length, drafted, errors };
}

export type ReviewWithReply = {
  review_id: string;
  rating: number | null;
  text: string;
  reviewer_name: string | null;
  channel: string | null;
  listing_nickname: string | null;
  building_code: string | null;
  created_at: string;
  reply_id: string | null;
  reply_language: string | null;
  reply_status: 'draft' | 'approved' | 'sent' | 'dismissed' | 'failed' | null;
  ai_draft: string | null;
  agent_final: string | null;
};

export async function listReviewsWithReplies(limit = 50): Promise<ReviewWithReply[]> {
  const sb = supabaseAdmin();
  const { data: reviews, error: reviewsErr } = await sb
    .from('guesty_reviews')
    .select(
      'id, channel_id, listing_id, overall_rating, public_review, created_at_source, created_at_guesty, synced_at',
    )
    // synced_at is always populated; created_at_source is preferred for the
    // user-facing date but isn't always present on legacy rows. Order by
    // synced_at so newly-pulled rows surface at the top regardless.
    .order('synced_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (reviewsErr) {
    console.warn('[list-reviews-with-replies] supabase error', reviewsErr.message);
    return [];
  }
  const rows = (reviews as Array<{
    id: string;
    channel_id: string | null;
    listing_id: string | null;
    overall_rating: number | null;
    public_review: string | null;
    created_at_source: string | null;
    created_at_guesty: string | null;
    synced_at: string | null;
  }> | null) || [];
  if (!rows.length) return [];

  const ids = rows.map(r => r.id);
  const { data: replies } = await sb
    .from('beithady_review_replies')
    .select('id, guesty_review_id, language, status, ai_draft, agent_final, reviewer_name')
    .in('guesty_review_id', ids);
  const replyMap = new Map<string, {
    id: string;
    language: string | null;
    status: ReviewWithReply['reply_status'];
    ai_draft: string | null;
    agent_final: string | null;
    reviewer_name: string | null;
  }>();
  for (const r of (replies as Array<{
    id: string; guesty_review_id: string; language: string | null;
    status: ReviewWithReply['reply_status']; ai_draft: string | null;
    agent_final: string | null; reviewer_name: string | null;
  }> | null) || []) {
    replyMap.set(r.guesty_review_id, r);
  }

  const listingIds = Array.from(new Set(rows.map(r => r.listing_id).filter((x): x is string => !!x)));
  const listingMap = new Map<string, { nickname: string | null; building: string | null }>();
  if (listingIds.length) {
    const { data: listings } = await sb
      .from('guesty_listings')
      .select('id, nickname, building_code')
      .in('id', listingIds);
    for (const l of (listings as Array<{ id: string; nickname: string | null; building_code: string | null }> | null) || []) {
      listingMap.set(l.id, { nickname: l.nickname, building: l.building_code });
    }
  }

  return rows.map(r => {
    const reply = replyMap.get(r.id);
    const listing = r.listing_id ? listingMap.get(r.listing_id) : null;
    // Prefer the OTA-source timestamp (when the guest actually left the
    // review), fall back to Guesty's createdAt, then to our sync time.
    const effectiveCreatedAt =
      r.created_at_source || r.created_at_guesty || r.synced_at || new Date().toISOString();
    return {
      review_id: r.id,
      rating: r.overall_rating != null ? Math.round(r.overall_rating) : null,
      text: r.public_review || '',
      reviewer_name: reply?.reviewer_name || null,
      channel: r.channel_id,
      listing_nickname: listing?.nickname || null,
      building_code: listing?.building || null,
      created_at: effectiveCreatedAt,
      reply_id: reply?.id || null,
      reply_language: reply?.language || null,
      reply_status: reply?.status || null,
      ai_draft: reply?.ai_draft || null,
      agent_final: reply?.agent_final || null,
    };
  });
}
