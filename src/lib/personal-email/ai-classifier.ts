import Anthropic from '@anthropic-ai/sdk';
import { AiClassificationOutput } from './schema';
import type { CategorySlug } from './types';
import { buildSystemPrompt, buildUserMessage } from './prompt';
import type { CorrectionExample } from './corrections';

const MODEL = 'claude-haiku-4-5-20251001';

// Haiku 4.5 published rates (per million tokens). Update when pricing
// changes. Source: anthropic.com/pricing.
const COST = {
  input_per_mtok: 1.0,
  cache_read_per_mtok: 0.1,
  output_per_mtok: 5.0,
};

export type ClassifierInput = {
  fromHeader: string;
  toHeader: string;
  subject: string;
  hasListUnsubscribe: boolean;
  gmailLabelIds: string[];
  bodyExcerpt: string;
  accountDisplayName: string;
};

export type ClassifierResult = {
  category: CategorySlug;
  confidence: number;
  reason: string;
  needs_review: boolean;
  cost_usd: number;
};

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export async function classifyWithAi(
  input: ClassifierInput,
  recentCorrectionsByCategory: Record<CategorySlug, CorrectionExample[]>,
): Promise<ClassifierResult> {
  const systemPrompt = buildSystemPrompt(recentCorrectionsByCategory);
  const userMessage = buildUserMessage(input);

  const res = await getClient().messages.create({
    model: MODEL,
    max_tokens: 50,
    // Prompt-cache the (large, stable) system prompt — fresh user
    // message stays uncached. Spec §12.
    system: [
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    ],
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = res.content
    .filter((c: any) => c.type === 'text')
    .map((c: any) => c.text)
    .join('');

  let parsed: { category: CategorySlug; confidence: number; reason: string } | null = null;
  try {
    const json = JSON.parse(text);
    parsed = AiClassificationOutput.parse(json);
  } catch {
    parsed = null;
  }

  const cost = computeCost(res.usage);

  if (!parsed) {
    return {
      category: 'notifications',
      confidence: 0,
      reason: 'parse_failed',
      needs_review: true,
      cost_usd: cost,
    };
  }
  return {
    category: parsed.category,
    confidence: parsed.confidence,
    reason: parsed.reason,
    needs_review: parsed.confidence < 0.7,
    cost_usd: cost,
  };
}

function computeCost(usage: any): number {
  const inputTokens = Number(usage?.input_tokens ?? 0);
  const cacheRead = Number(usage?.cache_read_input_tokens ?? 0);
  const cacheCreation = Number(usage?.cache_creation_input_tokens ?? 0);
  const output = Number(usage?.output_tokens ?? 0);
  // input_tokens already excludes cached portions per Anthropic's API.
  return (
    (inputTokens / 1e6) * COST.input_per_mtok +
    (cacheRead / 1e6) * COST.cache_read_per_mtok +
    (cacheCreation / 1e6) * COST.input_per_mtok * 1.25 + // cache write = 1.25x input
    (output / 1e6) * COST.output_per_mtok
  );
}
