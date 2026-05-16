import { describe, it, expect } from 'vitest';
import { computeAnomalies, type PlatformDailyTotals } from './anomalies';

const TODAY = '2026-05-16';
const YESTERDAY = '2026-05-15';

describe('computeAnomalies', () => {
  it('detects spend_spike when today > 3× yesterday', () => {
    const totals: Record<string, PlatformDailyTotals> = {
      meta: { today_spend: 100, yesterday_spend: 25, today_leads: 10, week_spend: 500, week_value: 600 },
    };
    const events = computeAnomalies(totals);
    expect(events).toContainEqual(expect.objectContaining({
      type: 'spend_spike', platform: 'meta', severity: 'warning',
    }));
  });
  it('marks critical severity at ≥ 5× spike', () => {
    const totals: Record<string, PlatformDailyTotals> = {
      meta: { today_spend: 150, yesterday_spend: 25, today_leads: 10, week_spend: 500, week_value: 600 },
    };
    const events = computeAnomalies(totals);
    expect(events.find(e => e.type === 'spend_spike')?.severity).toBe('critical');
  });
  it('detects zero_leads with > $30 spend', () => {
    const totals: Record<string, PlatformDailyTotals> = {
      meta: { today_spend: 50, yesterday_spend: 50, today_leads: 0, week_spend: 350, week_value: 0 },
    };
    const events = computeAnomalies(totals);
    expect(events.find(e => e.type === 'zero_leads')).toBeTruthy();
  });
  it('does NOT detect zero_leads below $30 floor', () => {
    const totals: Record<string, PlatformDailyTotals> = {
      meta: { today_spend: 20, yesterday_spend: 20, today_leads: 0, week_spend: 100, week_value: 0 },
    };
    const events = computeAnomalies(totals);
    expect(events.find(e => e.type === 'zero_leads')).toBeUndefined();
  });
  it('detects low_roas when week roas < 1 and week spend > $100', () => {
    const totals: Record<string, PlatformDailyTotals> = {
      meta: { today_spend: 20, yesterday_spend: 20, today_leads: 1, week_spend: 200, week_value: 150 },
    };
    const events = computeAnomalies(totals);
    expect(events.find(e => e.type === 'low_roas')?.severity).toBe('critical');
  });
  it('returns empty for healthy platform', () => {
    const totals: Record<string, PlatformDailyTotals> = {
      meta: { today_spend: 30, yesterday_spend: 28, today_leads: 5, week_spend: 200, week_value: 800 },
    };
    expect(computeAnomalies(totals)).toEqual([]);
  });
});
