import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  delete process.env.ANTHROPIC_API_KEY;
});

describe('buildAIInsights', () => {
  it('returns null when ANTHROPIC_API_KEY is missing', async () => {
    const { buildAIInsights } = await import('./build-insights');
    const result = await buildAIInsights({} as any);
    expect(result).toBeNull();
  });

  it('parses the JSON response and returns insights', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    vi.doMock('../anthropic', () => ({
      HAIKU: 'claude-haiku-test',
      anthropic: () => ({
        messages: {
          create: () => Promise.resolve({
            content: [{
              type: 'text',
              text: '{"insights":[{"tone":"positive","text":"Pace +62% vs LM"},{"tone":"warning","text":"BH-73 25% occupancy"}]}',
            }],
          }),
        },
      }),
    }));
    const { buildAIInsights } = await import('./build-insights');
    const out = await buildAIInsights({ report_date: '2026-05-05', all: { occupancy_today_pct: 42 } } as any);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(2);
    expect(out![0].tone).toBe('positive');
    expect(out![1].text).toContain('BH-73');
  });

  it('returns null on malformed JSON response', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    vi.doMock('../anthropic', () => ({
      HAIKU: 'claude-haiku-test',
      anthropic: () => ({
        messages: {
          create: () => Promise.resolve({ content: [{ type: 'text', text: 'not json' }] }),
        },
      }),
    }));
    const { buildAIInsights } = await import('./build-insights');
    const out = await buildAIInsights({} as any);
    expect(out).toBeNull();
  });
});
