import { describe, it, expect } from 'vitest';
import { cairoDayHour, bucketLeadsByHour, normalizeMetaHourlyRow, type RawLeadForHourly } from './hourly';

describe('cairoDayHour', () => {
  it('returns Mon=0 for a Monday Cairo morning', () => {
    expect(cairoDayHour('2026-05-11T08:00:00+03:00')).toEqual({ day_of_week: 0, hour: 8 });
  });
  it('returns Sun=6 for a Sunday Cairo evening', () => {
    expect(cairoDayHour('2026-05-10T20:00:00+03:00')).toEqual({ day_of_week: 6, hour: 20 });
  });
  it('returns Tue=1 for a Tuesday Cairo midday', () => {
    expect(cairoDayHour('2026-05-12T12:00:00+03:00')).toEqual({ day_of_week: 1, hour: 12 });
  });
  it('crosses midnight Cairo correctly from UTC', () => {
    // UTC 22:30 on May 11 = Cairo 01:30 on May 12 (Tue)
    expect(cairoDayHour('2026-05-11T22:30:00Z')).toEqual({ day_of_week: 1, hour: 1 });
  });
});

describe('bucketLeadsByHour', () => {
  it('counts leads per (day_of_week, hour) bucket', () => {
    const leads: RawLeadForHourly[] = [
      { created_at: '2026-05-11T08:00:00+03:00' },  // Mon 8h
      { created_at: '2026-05-11T08:30:00+03:00' },  // Mon 8h (same bucket)
      { created_at: '2026-05-13T19:00:00+03:00' },  // Wed 19h
    ];
    const out = bucketLeadsByHour(leads);
    const mon8 = out.find(b => b.day_of_week === 0 && b.hour === 8);
    const wed19 = out.find(b => b.day_of_week === 2 && b.hour === 19);
    expect(mon8?.lead_count).toBe(2);
    expect(wed19?.lead_count).toBe(1);
  });
  it('returns empty array for no leads', () => {
    expect(bucketLeadsByHour([])).toEqual([]);
  });
});

describe('normalizeMetaHourlyRow', () => {
  it('parses hour from "08:00:00 - 08:59:59" string', () => {
    const out = normalizeMetaHourlyRow({
      hourly_stats_aggregated_by_advertiser_time_zone: '08:00:00 - 08:59:59',
      impressions: '120',
      clicks: '5',
      spend: '0.50',
      date_start: '2026-05-11',
    }, { accountId: 1, campaignId: 5 });
    expect(out).toMatchObject({
      account_id: 1,
      campaign_id: 5,
      platform: 'meta',
      metric_date: '2026-05-11',
      hour: 8,
      impressions: 120,
      clicks: 5,
      spend_micros: 500_000,
    });
  });
  it('returns null when hour string unparseable', () => {
    const out = normalizeMetaHourlyRow({
      hourly_stats_aggregated_by_advertiser_time_zone: 'invalid',
      impressions: '0', clicks: '0', spend: '0', date_start: '2026-05-11',
    }, { accountId: 1, campaignId: 5 });
    expect(out).toBeNull();
  });
});
