import { describe, it, expect, vi, beforeEach } from 'vitest';

const { matchRuleMock, classifyAi, sync, persist, loadActiveRulesMock, loadCorrectionsMock } = vi.hoisted(() => ({
  matchRuleMock: vi.fn(),
  classifyAi: vi.fn(),
  sync: vi.fn(),
  persist: vi.fn(),
  loadActiveRulesMock: vi.fn(async () => []),
  loadCorrectionsMock: vi.fn(async () => ({})),
}));

vi.mock('./rule-matcher', () => ({ matchRule: matchRuleMock }));
vi.mock('./ai-classifier', () => ({ classifyWithAi: classifyAi }));
vi.mock('./label-sync', () => ({ syncLabelChange: sync }));
vi.mock('./pipeline-db', () => ({
  loadActiveRules: loadActiveRulesMock,
  persistClassification: persist,
  loadCorrectionsForFewShot: loadCorrectionsMock,
}));

import { classifyOneEmail } from './pipeline';

beforeEach(() => {
  matchRuleMock.mockReset();
  classifyAi.mockReset();
  sync.mockReset();
  persist.mockReset();
  loadActiveRulesMock.mockReset().mockResolvedValue([]);
  loadCorrectionsMock.mockReset().mockResolvedValue({});
});

const baseInput = {
  account: { id: 'acc-1', email: 'a@b.com', display_name: 'GMAIL', oauth_refresh_token_encrypted: 'x' } as any,
  emailLogId: 'log-1',
  gmailMessageId: 'msg-1',
  features: {
    fromAddress: 'noreply@stripe.com', fromDomain: 'stripe.com',
    toAddress: 'me@me.com', subject: 'Receipt #123',
    hasListUnsubscribe: false, gmailLabelIds: [], gmailLabelNames: [],
    bodyExcerpt: 'Thanks',  receivedIso: null,
  },
  fromHeader: 'noreply@stripe.com',
  toHeader: 'me@me.com',
  oldCategory: null,
  twoWaySyncEnabled: true,
  dailyCapUsd: 0.5,
};

describe('classifyOneEmail', () => {
  it('rule-only path: rule matched, target NOT in always-AI → skip AI', async () => {
    matchRuleMock.mockReturnValue({
      target_category: 'bills_receipts', match_type: 'subject_contains', match_value: 'Receipt',
    });
    await classifyOneEmail(baseInput);
    expect(classifyAi).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      category: 'bills_receipts', method: 'rule',
    }));
    expect(sync).toHaveBeenCalled();
  });

  it('always-AI fall-through: rule matched action_required → AI also runs', async () => {
    matchRuleMock.mockReturnValue({ target_category: 'action_required' });
    classifyAi.mockResolvedValue({
      category: 'action_required', confidence: 0.9, reason: 'r', needs_review: false, cost_usd: 0.001,
    });
    await classifyOneEmail(baseInput);
    expect(classifyAi).toHaveBeenCalled();
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      category: 'action_required', method: 'ai',
    }));
  });

  it('no rule → AI runs', async () => {
    matchRuleMock.mockReturnValue(null);
    classifyAi.mockResolvedValue({
      category: 'newsletters', confidence: 0.85, reason: 'r', needs_review: false, cost_usd: 0.001,
    });
    await classifyOneEmail(baseInput);
    expect(classifyAi).toHaveBeenCalled();
  });

  it('cost cap exhausted → rule-only fallback, marks needs_review', async () => {
    matchRuleMock.mockReturnValue(null);
    await classifyOneEmail({ ...baseInput, currentDailyCostUsd: 0.5 });
    expect(classifyAi).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      // Fallback bucket switched from `notifications` to `unassigned`
      // so the catch-all triage view actually surfaces what the
      // pipeline couldn't sort. (Migration 0094 seeded the slug.)
      category: 'unassigned', needs_review: true, reason: 'ai_budget_exhausted',
    }));
  });

  it('does not call sync when twoWaySyncEnabled=false', async () => {
    matchRuleMock.mockReturnValue({ target_category: 'bills_receipts' });
    await classifyOneEmail({ ...baseInput, twoWaySyncEnabled: false });
    expect(sync).not.toHaveBeenCalled();
  });
});
