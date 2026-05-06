import 'server-only';
import { anthropic, HAIKU } from '../anthropic';
import type { DailyReportPayload, AIInsight } from './types';

const SYSTEM = `You are a hospitality ops analyst writing a daily morning brief. Given a JSON snapshot of yesterday's performance, output 3 to 5 narrative bullets in JSON format. Each bullet:
- "tone": one of "positive" | "neutral" | "warning"
- "text": a single concise sentence (under 30 words) calling out a notable signal — pace, building anomaly, channel shift, review flag, inquiry SLA breach. Avoid restating obvious totals.

Output ONLY valid JSON: {"insights":[{"tone":"...","text":"..."}, ...]}. No prose, no markdown.`;

export async function buildAIInsights(payload: DailyReportPayload): Promise<AIInsight[] | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    // Curate a compact JSON the LLM can reason about — not the full payload
    const compact = {
      report_date: payload.report_date,
      occupancy_today_pct: payload.all?.occupancy_today_pct ?? null,
      mtd_revenue_usd: payload.all?.revenue_mtd_usd ?? null,
      pickup_vs_prior_month_pct: payload.all?.pickup_vs_prior_month_pct ?? null,
      reviews_avg: payload.reviews?.avg_rating_mtd ?? null,
      reviews_flagged_24h: payload.reviews?.last_24h?.filter((r) => r.flagged).length ?? 0,
      inquiries_unanswered: payload.inquiry_triage?.inquiries_unanswered_count ?? 0,
      response_time_yest_min: payload.conversations?.yesterday.avg_response_minutes ?? null,
      per_building_occupancy: payload.per_building
        ? Object.fromEntries(Object.entries(payload.per_building).map(([k, v]) => [k, v.occupancy_today_pct]))
        : {},
      cancel_risk_count: payload.cancel_risk?.count ?? 0,
      goal_progress_pct: payload.goal?.pct_of_target ?? null,
    };
    const resp = await anthropic().messages.create({
      model: HAIKU,
      max_tokens: 600,
      system: SYSTEM,
      messages: [{ role: 'user', content: JSON.stringify(compact) }],
    });
    const block = resp.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') return null;
    const text = block.text.trim();
    // Try to parse — model may have wrapped in code fences
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    if (!parsed || !Array.isArray(parsed.insights)) return null;
    return parsed.insights
      .filter((i: unknown) => i && typeof i === 'object' && (i as AIInsight).text)
      .slice(0, 5)
      .map((i: AIInsight) => ({
        tone: ['positive', 'neutral', 'warning'].includes(i.tone) ? i.tone : 'neutral',
        text: String(i.text).trim().slice(0, 200),
      }));
  } catch (err) {
    console.warn('[build-insights] exception', err);
    return null;
  }
}
