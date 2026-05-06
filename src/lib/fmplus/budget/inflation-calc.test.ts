import { describe, it, expect } from 'vitest';
import { applyInflation, projectYear, classifyLine } from './inflation-calc';

describe('inflation-calc', () => {
  it('applies uniform manpower inflation to a manning line', () => {
    const line = {
      line_code: 'hk_mf_8h',
      service_line: 'hk' as const,
      category: 'manning' as const,
      qty: 120,
      unit_cost: 12840,
    };
    const out = applyInflation(line, { revenue: 7, manpower: 10, other: 5 }, {});
    expect(out.unit_cost).toBeCloseTo(12840 * 1.1, 2);
  });

  it('applies non-manpower inflation to a tools line', () => {
    const line = {
      line_code: 'tool_broom_soft',
      service_line: 'hk' as const,
      category: 'tools' as const,
      qty: 10,
      unit_cost: 85,
    };
    const out = applyInflation(line, { revenue: 7, manpower: 10, other: 5 }, {});
    expect(out.unit_cost).toBeCloseTo(85 * 1.05, 2);
  });

  it('applies non-manpower inflation to consumables', () => {
    const line = {
      line_code: 'cons_floor_clean_5l',
      service_line: 'hk' as const,
      category: 'consumables' as const,
      qty: 50,
      unit_cost: 42,
    };
    const out = applyInflation(line, { revenue: 7, manpower: 10, other: 5 }, {});
    expect(out.unit_cost).toBeCloseTo(42 * 1.05, 2);
  });

  it('per-line override wins over uniform', () => {
    const line = {
      line_code: 'veh_microbus',
      service_line: 'hk' as const,
      category: 'transport' as const,
      qty: 2,
      unit_cost: 28400,
    };
    const out = applyInflation(line, { revenue: 7, manpower: 10, other: 5 }, { veh_microbus: 15 });
    expect(out.unit_cost).toBeCloseTo(28400 * 1.15, 2);
  });

  it('per-line override of 0 is respected (no inflation)', () => {
    const line = {
      line_code: 'fuel',
      service_line: 'hk' as const,
      category: 'transport' as const,
      qty: 1,
      unit_cost: 12500,
    };
    const out = applyInflation(line, { revenue: 7, manpower: 10, other: 5 }, { fuel: 0 });
    expect(out.unit_cost).toBeCloseTo(12500, 2);
  });

  it('% of revenue items track revenue inflation, not the "other" knob', () => {
    expect(classifyLine({
      line_code: 'gov_taminat',
      category: 'governmental',
      service_line: 'hk',
    })).toBe('revenue_pct');

    const line = {
      line_code: 'gov_taminat',
      service_line: 'hk' as const,
      category: 'governmental' as const,
      qty: 1,
      unit_cost: 60_000,
    };
    const out = applyInflation(line, { revenue: 7, manpower: 10, other: 5 }, {});
    expect(out.unit_cost).toBeCloseTo(60_000 * 1.07, 2);
  });

  it('non-taminat governmental lines use "other" knob', () => {
    expect(classifyLine({
      line_code: 'gov_tax_stamps',
      category: 'governmental',
      service_line: 'hk',
    })).toBe('other');
  });

  it('projectYear sums all line projections + projects revenue', () => {
    const lines = [
      { line_code: 'a', service_line: 'hk' as const, category: 'manning' as const, qty: 1, unit_cost: 1000 },
      { line_code: 'b', service_line: 'hk' as const, category: 'tools' as const, qty: 10, unit_cost: 100 },
    ];
    const out = projectYear(lines, { revenue: 0, manpower: 10, other: 5 }, {}, 50_000);
    // Manning: 1 × 1000 × 1.10 = 1100; Tools: 10 × 100 × 1.05 = 1050
    expect(out.totalCost).toBeCloseTo(1100 + 1050, 2);
    expect(out.projectedRevenue).toBeCloseTo(50_000, 2);
  });

  it('projectYear projectedRevenue uses revenue knob', () => {
    const out = projectYear([], { revenue: 7, manpower: 10, other: 5 }, {}, 100_000);
    expect(out.projectedRevenue).toBeCloseTo(107_000, 2);
  });
});
