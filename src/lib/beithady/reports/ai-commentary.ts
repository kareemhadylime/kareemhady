// Beithady · Generate Report · AI commentary via Haiku.
// Generates 3-5 bullet conclusions in the tone of the manual reports
// (terse, factual, % deltas, identifies winners/losers + 1 actionable insight).
// ~$0.001 / call. Cached on saved_reports.last_run_data.

import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import type { ReportData } from './types';
import { METRIC_LABEL } from './types';

function summarizeForPrompt(data: ReportData): string {
  const lines: string[] = [];
  lines.push(`Title: ${data.config.title}`);
  lines.push(`Group-by: ${data.config.groupBy.primary}`);
  lines.push(`Periods: ${data.config.periods.map(p => p.label).join(' | ')}`);
  lines.push(`Metrics: ${data.config.metrics.map(m => METRIC_LABEL[m]).join(', ')}`);
  lines.push('');
  lines.push('Rows:');
  for (const r of data.rows.slice(0, 50)) {
    const label = r.groupLabels.secondary
      ? `${r.groupLabels.primary} · ${r.groupLabels.secondary}`
      : r.groupLabels.primary;
    const cellStrs = Object.entries(r.cells).map(
      ([k, c]) => `${k}=${c.formatted}`
    );
    lines.push(`- ${label}: ${cellStrs.join(', ')}`);
  }
  if (data.anomalies.length) {
    lines.push('');
    lines.push('Anomalies (>2σ):');
    for (const a of data.anomalies.slice(0, 10)) {
      lines.push(`- ${a.groupKey} ${a.metricKey} ${a.periodId}: ${a.reason}`);
    }
  }
  if (Object.keys(data.comparisons.deltas).length) {
    lines.push('');
    lines.push(`Comparisons mode: ${data.config.comparison?.mode || 'none'}`);
    const sample = Object.entries(data.comparisons.deltas).slice(0, 30);
    for (const [k, d] of sample) {
      const pct = d.pct != null ? `${d.pct >= 0 ? '+' : ''}${d.pct.toFixed(1)}%` : '—';
      lines.push(`- ${k}: ${pct} (Δ ${d.abs?.toFixed(1) ?? '—'})`);
    }
  }
  return lines.join('\n');
}

const PROMPT_SYSTEM = `You are a hospitality business analyst writing the conclusions section of a Beit Hady performance report. Style: terse, factual, percentage-driven, identifies top winners/losers and includes 1-2 actionable insights. Match this tone:
"The average occupancy rate at Beit Hadi for 2-bedroom units was 72% in 2025, while in 2026 it declined to 59%."
"4-bedroom units are the best-performing category in terms of both occupancy rate and profitability."

Output ONLY valid JSON: {"bullets": string[3-5], "action_items": string[2-3]}. Bullets MUST quote specific numbers from the data. No markdown. No surrounding prose.`;

export async function generateCommentary(
  data: ReportData
): Promise<{ bullets: string[]; action_items: string[] } | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (data.config.enableAiCommentary === false) return null;
  if (data.rows.length === 0) return null;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const summary = summarizeForPrompt(data);

  try {
    const resp = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 700,
      system: PROMPT_SYSTEM,
      messages: [{ role: 'user', content: summary }],
    });
    const text =
      resp.content[0].type === 'text' ? resp.content[0].text.trim() : '';
    // Strip markdown fences if present
    const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
    const parsed = JSON.parse(cleaned) as {
      bullets?: string[];
      action_items?: string[];
    };
    if (!Array.isArray(parsed.bullets)) return null;
    return {
      bullets: parsed.bullets.slice(0, 5),
      action_items: Array.isArray(parsed.action_items)
        ? parsed.action_items.slice(0, 3)
        : [],
    };
  } catch (err) {
    console.error('[ai-commentary] failed', err);
    return null;
  }
}
