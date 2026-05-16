import { describe, it, expect } from 'vitest';
import { InsightsBreakdownFetchError, InsightsUpsertError } from './insights-errors';

describe('InsightsBreakdownFetchError', () => {
  it('serializes platform + step in message', () => {
    const e = new InsightsBreakdownFetchError('meta', 'quota', 'rate limited');
    expect(e.message).toBe('meta_breakdown_quota: rate limited');
    expect(e.name).toBe('InsightsBreakdownFetchError');
    expect(e.platform).toBe('meta');
    expect(e.step).toBe('quota');
  });
  it('is catchable as Error', () => {
    try { throw new InsightsBreakdownFetchError('google', 'auth', 'token expired'); }
    catch (e) { expect(e).toBeInstanceOf(Error); expect(e).toBeInstanceOf(InsightsBreakdownFetchError); }
  });
});

describe('InsightsUpsertError', () => {
  it('serializes table in message', () => {
    const e = new InsightsUpsertError('demo', 'check constraint violated');
    expect(e.message).toBe('insights_upsert[demo]: check constraint violated');
    expect(e.name).toBe('InsightsUpsertError');
    expect(e.table).toBe('demo');
  });
});
