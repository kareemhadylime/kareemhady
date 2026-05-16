import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { anthropic, HAIKU } from '@/lib/anthropic';
import { recordAudit } from '@/lib/beithady/audit';
import type { AnomalyEvent } from './anomalies';

export const AI_SUMMARY_DAILY_CAP = 20;
// Approximate cost based on haiku-4-5 pricing (~$0.80/$4 per Mtok in/out, ~1k tokens per call).
const APPROX_COST_PER_CALL_USD = 0.01;

export type AiSummaryDashboardData = {
  kpis: { spend_egp: number; leads: number; bookings: number; cpl_egp: number | null; roas: number | null; attributed_revenue_egp: number };
  topCountries: Array<{ country: string; clicks: number; pct: number }>;
  topDemos: Array<{ age_range: string; gender: string; clicks: number; pct: number }>;
  topDevices: Array<{ device: string; clicks: number; pct: number }>;
  topCampaigns: Array<{ name: string; platform: string; leads: number; cpl_egp: number | null; quality_pct: number }>;
  frtSummary: { median_minutes: number | null; p95_minutes: number | null; over_1h_pct: number };
  anomalies: AnomalyEvent[];
  funnelStages: Array<{ key: string; count: number }>;
};

export type AiSummaryResult =
  | { ok: true; summary: string; cost_usd: number }
  | { ok: false; error: 'daily_cap_reached' | 'api_error' | 'no_data'; cost_usd: number; detail?: string };

export function buildAiSummaryPrompt(range: { from: string; to: string }, data: AiSummaryDashboardData): string {
  return `You are an ad-ops analyst for Beit Hady, a boutique short-term rental brand in Egypt
operating five buildings: BH-26, BH-73, BH-435, BH-OK, BH-34.

Given this dashboard for the period ${range.from} through ${range.to}, write a 3-paragraph summary:

1. WHAT'S WORKING: top platforms/campaigns/audiences driving leads + bookings. Cite numbers.
2. WHAT'S NOT WORKING: slow FRT, high CPL campaigns, anomalies. Cite numbers.
3. ACTION: one concrete recommendation for tomorrow. Be specific (kill ad X, shift budget from Y to Z).

Data:
${JSON.stringify(data, null, 2)}

Keep each paragraph under 50 words. No bullet points, no hedging language.
Use EGP for money. Round percentages to whole numbers.`;
}

async function todaysAiCallCount(): Promise<number> {
  const sb = supabaseAdmin();
  // Cairo-today boundary
  const cairoToday = new Date().toLocaleString('en-CA', { timeZone: 'Africa/Cairo' }).slice(0, 10);
  const sinceIso = new Date(cairoToday + 'T00:00:00+03:00').toISOString();
  const { count } = await sb.from('beithady_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('module', 'ads')
    .eq('action', 'ai_summary_generated')
    .gte('created_at', sinceIso);
  return count ?? 0;
}

export async function generateAiSummary(opts: {
  range: { from: string; to: string };
  dashboardData: AiSummaryDashboardData;
}): Promise<AiSummaryResult> {
  const used = await todaysAiCallCount();
  if (used >= AI_SUMMARY_DAILY_CAP) {
    return { ok: false, error: 'daily_cap_reached', cost_usd: 0 };
  }
  const prompt = buildAiSummaryPrompt(opts.range, opts.dashboardData);
  try {
    const client = anthropic();
    const resp = await client.messages.create({
      model: HAIKU,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });
    const summary = resp.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('\n')
      .trim();
    await recordAudit({
      module: 'ads',
      action: 'ai_summary_generated',
      metadata: {
        range: opts.range,
        cost_usd: APPROX_COST_PER_CALL_USD,
        model: HAIKU,
        prompt_chars: prompt.length,
        summary_chars: summary.length,
        summary,   // Dashboard recall — Task 17 reads this back
      },
    });
    return { ok: true, summary, cost_usd: APPROX_COST_PER_CALL_USD };
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    console.error('[ai-summary] anthropic call failed:', detail);
    await recordAudit({
      module: 'ads',
      action: 'ai_summary_timeout',
      metadata: { range: opts.range, error: detail.slice(0, 200) },
    });
    return { ok: false, error: 'api_error', cost_usd: 0, detail };
  }
}
