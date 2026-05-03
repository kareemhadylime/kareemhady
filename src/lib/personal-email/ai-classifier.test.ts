import { describe, it, expect, vi, beforeEach } from 'vitest';

const create = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create };
  },
}));

import { classifyWithAi } from './ai-classifier';

beforeEach(() => create.mockReset());

const okEmail = {
  fromHeader: 'a@b.com', toHeader: 'me@me.com', subject: 's',
  hasListUnsubscribe: false, gmailLabelIds: [], bodyExcerpt: 'b',
  accountDisplayName: 'GMAIL',
};

describe('classifyWithAi', () => {
  it('parses a clean JSON response', async () => {
    create.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"category":"personal","confidence":0.9,"reason":"casual one-to-one"}' }],
      usage: { input_tokens: 1000, cache_read_input_tokens: 600, output_tokens: 30 },
    });
    const r = await classifyWithAi(okEmail, {} as any);
    expect(r.category).toBe('personal');
    expect(r.confidence).toBe(0.9);
    expect(r.cost_usd).toBeGreaterThan(0);
  });

  it('flags low confidence (< 0.7) as needs_review', async () => {
    create.mockResolvedValueOnce({
      content: [{ type: 'text', text: '{"category":"notifications","confidence":0.4,"reason":"unclear"}' }],
      usage: { input_tokens: 1000, cache_read_input_tokens: 600, output_tokens: 30 },
    });
    const r = await classifyWithAi(okEmail, {} as any);
    expect(r.needs_review).toBe(true);
  });

  it('falls back to notifications on JSON parse failure', async () => {
    create.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'not json at all' }],
      usage: { input_tokens: 1000, cache_read_input_tokens: 0, output_tokens: 30 },
    });
    const r = await classifyWithAi(okEmail, {} as any);
    expect(r.category).toBe('notifications');
    expect(r.needs_review).toBe(true);
    expect(r.reason).toMatch(/parse/i);
  });
});
