import { describe, it, expect, vi } from 'vitest';

// Hoist the mock so it's set up before the module imports
vi.mock('@/lib/anthropic', () => ({
  anthropic: vi.fn(() => ({
    messages: {
      create: vi.fn(async () => ({
        content: [{ type: 'text', text: 'TRANSLATED' }],
      })),
    },
  })),
  HAIKU: 'claude-haiku-4-5-20251001',
}));

import { translateMenuField } from './translate';
import { anthropic } from '@/lib/anthropic';

describe('translateMenuField', () => {
  it('returns trimmed text from anthropic response', async () => {
    const r = await translateMenuField({
      text: 'All-Day Breakfast',
      field: 'name',
      target_lang: 'ar',
    });
    expect(r.translation).toBe('TRANSLATED');
  });

  it('passes a prompt mentioning the source text and target lang', async () => {
    await translateMenuField({
      text: 'Ful with vegetables',
      field: 'description',
      target_lang: 'fr',
    });
    const instance = (anthropic as unknown as ReturnType<typeof vi.fn>).mock.results.at(-1)?.value;
    const calls = (instance.messages.create as ReturnType<typeof vi.fn>).mock.calls;
    const lastPrompt = calls[calls.length - 1][0].messages[0].content;
    expect(lastPrompt).toContain('Ful with vegetables');
    expect(lastPrompt).toContain('French');
  });

  it('returns empty translation for empty input', async () => {
    const r = await translateMenuField({
      text: '',
      field: 'name',
      target_lang: 'ru',
    });
    expect(r.translation).toBe('');
  });
});
