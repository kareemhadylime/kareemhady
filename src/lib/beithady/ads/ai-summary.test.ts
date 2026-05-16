import { describe, it, expect } from 'vitest';
import { buildAiSummaryPrompt, AI_SUMMARY_DAILY_CAP, type AiSummaryDashboardData } from './ai-summary';

const DATA: AiSummaryDashboardData = {
  kpis: { spend_egp: 14000, leads: 22, bookings: 7, cpl_egp: 636, roas: 2.5, attributed_revenue_egp: 35000 },
  topCountries: [{ country: 'EG', clicks: 800, pct: 70 }, { country: 'AE', clicks: 200, pct: 17 }],
  topDemos: [{ age_range: '25-34', gender: 'female', clicks: 400, pct: 35 }],
  topDevices: [{ device: 'mobile', clicks: 950, pct: 83 }],
  topCampaigns: [{ name: 'CTWA EG May', platform: 'meta', leads: 18, cpl_egp: 68, quality_pct: 27.8 }],
  frtSummary: { median_minutes: 12, p95_minutes: 47, over_1h_pct: 14 },
  anomalies: [],
  funnelStages: [{ key: 'impressions', count: 120000 }, { key: 'bookings', count: 7 }],
};

describe('buildAiSummaryPrompt', () => {
  it('includes the BH context line', () => {
    const p = buildAiSummaryPrompt({ from: '2026-05-01', to: '2026-05-16' }, DATA);
    expect(p).toContain('Beit Hady');
    expect(p).toContain('BH-26');
  });
  it('includes the date range', () => {
    const p = buildAiSummaryPrompt({ from: '2026-05-01', to: '2026-05-16' }, DATA);
    expect(p).toContain('2026-05-01');
    expect(p).toContain('2026-05-16');
  });
  it('serializes the dashboard data as JSON', () => {
    const p = buildAiSummaryPrompt({ from: '2026-05-01', to: '2026-05-16' }, DATA);
    expect(p).toContain('CTWA EG May');
    expect(p).toContain('27.8');
  });
  it('exports a daily cap constant of 20', () => {
    expect(AI_SUMMARY_DAILY_CAP).toBe(20);
  });
});
