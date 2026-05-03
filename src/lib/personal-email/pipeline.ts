import { matchRule } from './rule-matcher';
import { classifyWithAi } from './ai-classifier';
import { syncLabelChange } from './label-sync';
import { ALWAYS_AI_CATEGORIES } from './categories';
import type { CategorySlug, EmailFeatures, PersonalEmailRule } from './types';
import {
  loadActiveRules,
  persistClassification,
  loadCorrectionsForFewShot,
} from './pipeline-db';

export type ClassifyOneEmailInput = {
  account: {
    id: string;
    email: string;
    display_name: string | null;
    oauth_refresh_token_encrypted: string;
  };
  emailLogId: string;
  gmailMessageId: string;
  features: EmailFeatures;
  fromHeader: string;
  toHeader: string;
  oldCategory: CategorySlug | null;
  twoWaySyncEnabled: boolean;
  // Pre-loaded once per run by ingest.ts so this fn is testable in isolation.
  rules?: PersonalEmailRule[];
  recentCorrections?: any;
  currentDailyCostUsd?: number;
  dailyCapUsd: number;
};

export type ClassifyOneEmailResult = {
  category: CategorySlug;
  method: 'rule' | 'ai';
  ai_cost_usd: number;
  needs_review: boolean;
};

export async function classifyOneEmail(
  input: ClassifyOneEmailInput,
): Promise<ClassifyOneEmailResult> {
  const rules = input.rules ?? (await loadActiveRules());
  const ruleHit = matchRule(input.features, rules, input.account.id);

  // Special: gmail SPAM short-circuits both rule + AI.
  if (ruleHit && ruleHit.target_category === 'spam') {
    return finalize({
      input, category: 'spam', method: 'rule',
      reason: 'gmail_spam_label', confidence: 1, needs_review: false, ai_cost_usd: 0,
    });
  }

  // Cost cap: if exhausted, skip AI entirely and fall back to whatever
  // the rule said. If no rule, route to notifications + needs_review.
  const overCap = (input.currentDailyCostUsd ?? 0) >= input.dailyCapUsd;

  // Rule-only commit when: rule matched AND target NOT in always-AI.
  if (ruleHit && !ALWAYS_AI_CATEGORIES.has(ruleHit.target_category)) {
    return finalize({
      input,
      category: ruleHit.target_category,
      method: 'rule',
      reason: `rule:${ruleHit.match_type}=${ruleHit.match_value}`,
      confidence: 1,
      needs_review: false,
      ai_cost_usd: 0,
    });
  }

  if (overCap) {
    // No rule, or rule said action_required/personal but we can't afford AI.
    return finalize({
      input,
      category: ruleHit?.target_category ?? 'notifications',
      method: 'rule',
      reason: 'ai_budget_exhausted',
      confidence: null,
      needs_review: true,
      ai_cost_usd: 0,
    });
  }

  // AI path.
  const fewShot = input.recentCorrections ?? (await loadCorrectionsForFewShot(10));
  const ai = await classifyWithAi(
    {
      fromHeader: input.fromHeader,
      toHeader: input.toHeader,
      subject: input.features.subject,
      hasListUnsubscribe: input.features.hasListUnsubscribe,
      gmailLabelIds: input.features.gmailLabelIds,
      bodyExcerpt: input.features.bodyExcerpt,
      accountDisplayName: input.account.display_name ?? input.account.email,
    },
    fewShot,
  );
  return finalize({
    input,
    category: ai.category,
    method: 'ai',
    reason: ai.reason,
    confidence: ai.confidence,
    needs_review: ai.needs_review,
    ai_cost_usd: ai.cost_usd,
  });
}

async function finalize(args: {
  input: ClassifyOneEmailInput;
  category: CategorySlug;
  method: 'rule' | 'ai';
  reason: string;
  confidence: number | null;
  needs_review: boolean;
  ai_cost_usd: number;
}): Promise<ClassifyOneEmailResult> {
  const { input } = args;
  await persistClassification({
    emailLogId: input.emailLogId,
    category: args.category,
    confidence: args.confidence,
    method: args.method,
    reason: args.reason,
    needs_review: args.needs_review,
  });
  if (input.twoWaySyncEnabled && args.category !== input.oldCategory) {
    try {
      await syncLabelChange(input.account, input.gmailMessageId, input.oldCategory, args.category);
    } catch (e) {
      // Non-fatal — caller logs into run.errors. Sync can be retried.
      console.error('[personal-email] label sync failed', e);
    }
  }
  return {
    category: args.category,
    method: args.method,
    ai_cost_usd: args.ai_cost_usd,
    needs_review: args.needs_review,
  };
}
