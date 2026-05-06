import { describe, it, expect } from 'vitest';
import { validateDineToken } from './token-validate';

describe('validateDineToken', () => {
  it('returns invalid for empty token', async () => {
    const r = await validateDineToken('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('token_not_found');
  });

  it('returns invalid for too-short token', async () => {
    const r = await validateDineToken('short');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('token_not_found');
  });

  // Live DB lookup — skip unless SUPABASE_URL is set (integration env only)
  it.skipIf(!process.env.SUPABASE_URL)(
    'returns invalid for non-existent token',
    async () => {
      const r = await validateDineToken('this-is-a-fake-token-1234');
      expect(r.ok).toBe(false);
    }
  );
});
