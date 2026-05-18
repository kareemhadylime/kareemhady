// src/lib/fmplus/shift-report/render.test.ts
import { describe, expect, it } from 'vitest';
import {
  buildShiftReportHtml,
  buildShiftWAMessage,
  computeShiftTotals,
} from './render';
import type {
  ShiftReportConfig,
  ShiftReportData,
} from './types';

// A "City Gate-like" partial config: only Security, only morning shift,
// only 3 of the 7 master security roles added.
//
// Note: we use `as unknown as ShiftReportConfig['verticals']` here so the
// test file compiles both BEFORE Task 3 (when `VerticalConfig` still has the
// required `enabled` field) and AFTER (when it doesn't). The synthetic
// fixtures intentionally bypass the type so they can describe both states.
function partialConfig(): ShiftReportConfig {
  return {
    contractNumber: 'CON-2026-014',
    waGroup:        '120363TEST@g.us',
    verticals: {
      security: {
        shifts: ['morning'],
        roles: {
          manager:    { morning: 1 },
          supervisor: { morning: 2 },
          personnel:  { morning: 5 },
        },
      },
    } as unknown as ShiftReportConfig['verticals'],
  };
}

function emptyReport(): ShiftReportData {
  return {
    today_morning:     { security: { manager: 1, supervisor: 2, personnel: 4 } },
    yesterday_morning: { security: { manager: 1, supervisor: 1, personnel: 5 } },
    yesterday_night:   {},
  };
}

describe('computeShiftTotals (partial config)', () => {
  it('only counts roles that were added to the config', () => {
    const cfg  = partialConfig();
    const data = emptyReport();
    const t    = computeShiftTotals(cfg.verticals, 'morning', data.today_morning);

    // planned = 1+2+5 = 8 (manager + supervisor + personnel only)
    // actual  = 1+2+4 = 7
    expect(t.planned).toBe(8);
    expect(t.actual).toBe(7);
    expect(t.hasData).toBe(true);
  });

  it('returns zero totals when the section shift is not in vc.shifts', () => {
    const cfg  = partialConfig();
    const data = emptyReport();
    // security only has morning; asking for night → 0/0
    const t = computeShiftTotals(cfg.verticals, 'night', data.yesterday_night);
    expect(t.planned).toBe(0);
    expect(t.actual).toBe(0);
    expect(t.hasData).toBe(false);
  });

  it('ignores legacy enabled:false from old configs (backward compat)', () => {
    // Old saved JSONB shape — `enabled` was the gate, but presence now means added.
    // Double-cast so this compiles both pre and post Task 3.
    const verticals = {
      security: {
        enabled: false,
        shifts:  ['morning'],
        roles:   { manager: { morning: 3 } },
      },
    } as unknown as ShiftReportConfig['verticals'];
    const data: ShiftReportData = {
      today_morning:     { security: { manager: 2 } },
      yesterday_morning: {},
      yesterday_night:   {},
    };
    const t = computeShiftTotals(verticals, 'morning', data.today_morning);
    expect(t.planned).toBe(3);
    expect(t.actual).toBe(2);
  });
});

describe('buildShiftReportHtml (partial config)', () => {
  it('renders rows only for roles present in the config', () => {
    const cfg  = partialConfig();
    const data = emptyReport();
    const html = buildShiftReportHtml({ name: 'City Gate' }, cfg, data);

    // Added roles must appear
    expect(html).toContain('مدير الامن');
    expect(html).toContain('مشرف أمن');
    expect(html).toContain('فرد أمن');

    // Master-list roles NOT added must not appear
    expect(html).not.toContain('موتوسيكل');
    expect(html).not.toContain('سيارة الجيب');
    expect(html).not.toContain('اجهزة لاسلكية');
    expect(html).not.toContain('طوارئ');
  });

  it('omits verticals that are not in the config', () => {
    const cfg  = partialConfig();
    const data = emptyReport();
    const html = buildShiftReportHtml({ name: 'City Gate' }, cfg, data);

    // Security shows up
    expect(html).toContain('الأمن');
    // Other 3 master verticals were never added — should not appear in the HTML body.
    expect(html).not.toContain('النظافة');
    expect(html).not.toContain('بيست كنترول');
    expect(html).not.toContain('لاندسكيب');
  });
});

describe('buildShiftWAMessage (partial config)', () => {
  it('reports totals that match the partial config (planned sums the 3 added roles)', () => {
    const cfg  = partialConfig();
    const data = emptyReport();
    const msg  = buildShiftWAMessage({ name: 'City Gate' }, cfg, data);

    // Today morning: planned 8, actual 7
    expect(msg).toContain('الفعلي: *7*');
    expect(msg).toContain('التعاقدي: *8*');
    // Grand total: morning today (7/8) + morning yesterday (7/8) + night (0/0) = 14/16
    expect(msg).toContain('الفعلي: *14*');
    expect(msg).toContain('التعاقدي: *16*');
  });
});
