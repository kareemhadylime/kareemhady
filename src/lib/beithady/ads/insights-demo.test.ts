import { describe, it, expect } from 'vitest';
import {
  normalizeMetaDemoRows, normalizeGoogleDemoRows, normalizeTikTokDemoRows,
} from './insights-demo';

const CTX = { accountId: 1, campaignId: 5, adSetId: null as number | null, platform: 'meta' as const };

describe('normalizeMetaDemoRows', () => {
  it('parses age+gender directly from Meta payload', () => {
    const out = normalizeMetaDemoRows([
      { age: '25-34', gender: 'female', impressions: '100', clicks: '5', spend: '1.0', reach: '90', date_start: '2026-05-10' },
    ], CTX);
    expect(out[0]).toMatchObject({ age_range: '25-34', gender: 'female', impressions: 100 });
  });
  it('maps unknown gender to "unknown"', () => {
    const out = normalizeMetaDemoRows([
      { age: '25-34', gender: 'U', impressions: '1', clicks: '0', spend: '0', date_start: '2026-05-10' },
    ], CTX);
    expect(out[0].gender).toBe('unknown');
  });
  it('clamps invalid age bucket to "unknown"', () => {
    const out = normalizeMetaDemoRows([
      { age: '100-200', gender: 'male', impressions: '1', clicks: '0', spend: '0', date_start: '2026-05-10' },
    ], CTX);
    expect(out[0].age_range).toBe('unknown');
  });
});

describe('normalizeGoogleDemoRows', () => {
  it('reads ad_group_criterion.gender.type + ad_group_criterion.age_range.type', () => {
    const out = normalizeGoogleDemoRows({
      gender: [{ segments: { date: '2026-05-10' }, adGroupCriterion: { gender: { type: 'GENDER_FEMALE' } },
                 metrics: { impressions: '10', clicks: '1', costMicros: '1000' }, campaign: { id: '5' } }],
      ageRange: [{ segments: { date: '2026-05-10' }, adGroupCriterion: { ageRange: { type: 'AGE_RANGE_25_34' } },
                   metrics: { impressions: '20', clicks: '2', costMicros: '2000' }, campaign: { id: '5' } }],
    }, { ...CTX, platform: 'google' });
    // Google reports gender separately from age; we keep them as separate rows
    // with the "other" dimension = 'unknown'.
    expect(out).toHaveLength(2);
    const g = out.find(r => r.age_range === 'unknown' && r.gender === 'female');
    const a = out.find(r => r.age_range === '25-34' && r.gender === 'unknown');
    expect(g).toBeTruthy();
    expect(a).toBeTruthy();
  });
});

describe('normalizeTikTokDemoRows', () => {
  it('passes through age + gender', () => {
    const out = normalizeTikTokDemoRows([{
      dimensions: { age: '25-34', gender: 'female', campaign_id: '5', stat_time_day: '2026-05-10' },
      metrics: { impressions: '10', clicks: '1', spend: '0.5' },
    }], { ...CTX, platform: 'tiktok' });
    expect(out[0]).toMatchObject({ age_range: '25-34', gender: 'female' });
  });
});
