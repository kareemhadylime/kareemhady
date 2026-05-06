import 'server-only';
import { anthropic, HAIKU } from '../anthropic';
import type { ReviewSummary, ReviewTopicsSection } from './types';

const SYSTEM = `You are a guest-experience analyst. Given a list of recent guest review summaries, extract the top recurring topics. Output JSON only:
{"praised":[{"topic":"<lowercase noun>","count":N,"example":"<short quote or null>"}, ...], "complained":[...]}.
Topics are short noun phrases (e.g. "cleanliness", "staff", "noise", "wifi", "check-in"). Count = number of reviews mentioning that topic. Cap each list at 5 topics. If a side has no signal, return [].
Output ONLY the JSON object — no prose, no markdown fences.`;

export async function buildReviewTopics(reviews: ReviewSummary[]): Promise<ReviewTopicsSection | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!reviews || reviews.length === 0) return { praised: [], complained: [] };
  try {
    const compact = reviews.slice(0, 30).map((r) => ({
      rating: r.rating,
      summary: r.ai_summary?.slice(0, 200) ?? r.raw_text?.slice(0, 200) ?? '',
    }));
    const resp = await anthropic().messages.create({
      model: HAIKU,
      max_tokens: 500,
      system: SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify(compact) }],
    });
    const block = resp.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') return null;
    const text = block.text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    if (!parsed || !Array.isArray(parsed.praised) || !Array.isArray(parsed.complained)) return null;
    const trim = (arr: unknown[]) => arr
      .filter((t: unknown) => t && typeof t === 'object' && (t as { topic?: string }).topic)
      .slice(0, 5)
      .map((t) => ({
        topic: String((t as { topic: string }).topic).trim().toLowerCase().slice(0, 40),
        count: Number((t as { count?: number }).count ?? 0),
        example: (t as { example?: string | null }).example ? String((t as { example: string }).example).slice(0, 200) : null,
      }));
    return {
      praised: trim(parsed.praised),
      complained: trim(parsed.complained),
    };
  } catch (err) {
    console.warn('[build-review-topics] exception', err);
    return null;
  }
}
