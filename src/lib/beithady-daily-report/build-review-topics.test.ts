import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReviewSummary } from './types';

beforeEach(() => {
  vi.resetModules();
  delete process.env.ANTHROPIC_API_KEY;
});

describe('buildReviewTopics', () => {
  it('returns null when API key missing', async () => {
    const { buildReviewTopics } = await import('./build-review-topics');
    const out = await buildReviewTopics([{ ai_summary: 'clean place' } as ReviewSummary]);
    expect(out).toBeNull();
  });

  it('returns empty section when no reviews', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    const { buildReviewTopics } = await import('./build-review-topics');
    const out = await buildReviewTopics([]);
    expect(out).toEqual({ praised: [], complained: [] });
  });

  it('parses praised + complained topics', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    vi.doMock('../anthropic', () => ({
      HAIKU: 'claude-haiku-test',
      anthropic: () => ({
        messages: {
          create: () => Promise.resolve({
            content: [{ type: 'text', text: '{"praised":[{"topic":"cleanliness","count":12,"example":"spotless"}],"complained":[{"topic":"door-knocking","count":1,"example":"too loud"}]}' }],
          }),
        },
      }),
    }));
    const { buildReviewTopics } = await import('./build-review-topics');
    const out = await buildReviewTopics([{ ai_summary: 'great' } as ReviewSummary]);
    expect(out).not.toBeNull();
    expect(out!.praised[0].topic).toBe('cleanliness');
    expect(out!.complained[0].count).toBe(1);
  });
});
