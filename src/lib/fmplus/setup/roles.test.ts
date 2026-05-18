import { describe, expect, it } from 'vitest';
import {
  FMPLUS_ROLE_PRESETS,
  resolveFmplusPerms,
  type FmplusRolePreset,
} from './roles';

describe('FMPLUS_ROLE_PRESETS', () => {
  it('contains exactly the 5 canonical presets in display order', () => {
    expect(FMPLUS_ROLE_PRESETS.map((p) => p.key)).toEqual([
      'operations_manager',
      'site_manager',
      'shift_submitter',
      'budget_manager',
      'financials_viewer',
    ]);
  });

  it('every preset has both Arabic and English labels', () => {
    for (const p of FMPLUS_ROLE_PRESETS) {
      expect(p.labelAr).toBeTruthy();
      expect(p.labelEn).toBeTruthy();
    }
  });
});

describe('resolveFmplusPerms — preset defaults', () => {
  it('operations_manager gets full access', () => {
    const out = resolveFmplusPerms('operations_manager', null);
    expect(out).toEqual({
      financials:    'view',
      budget:        'edit',
      performance:   'view',
      shift_reports: 'configure',
      setup:         true,
    });
  });

  it('site_manager: shift-reports configure, budget+performance view, no financials/setup', () => {
    const out = resolveFmplusPerms('site_manager', null);
    expect(out).toEqual({
      financials:    'none',
      budget:        'view',
      performance:   'view',
      shift_reports: 'configure',
      setup:         false,
    });
  });

  it('shift_submitter: only submit shift reports and view performance', () => {
    const out = resolveFmplusPerms('shift_submitter', null);
    expect(out).toEqual({
      financials:    'none',
      budget:        'none',
      performance:   'view',
      shift_reports: 'submit',
      setup:         false,
    });
  });

  it('budget_manager: edit budget, view financials/performance, view shift reports', () => {
    const out = resolveFmplusPerms('budget_manager', null);
    expect(out).toEqual({
      financials:    'view',
      budget:        'edit',
      performance:   'view',
      shift_reports: 'view',
      setup:         false,
    });
  });

  it('financials_viewer: view financials + performance only', () => {
    const out = resolveFmplusPerms('financials_viewer', null);
    expect(out).toEqual({
      financials:    'view',
      budget:        'none',
      performance:   'view',
      shift_reports: 'none',
      setup:         false,
    });
  });
});

describe('resolveFmplusPerms — overrides', () => {
  it('partial override merges with preset defaults', () => {
    const out = resolveFmplusPerms('shift_submitter', { budget: 'edit' });
    expect(out).toEqual({
      financials:    'none',
      budget:        'edit',
      performance:   'view',
      shift_reports: 'submit',
      setup:         false,
    });
  });

  it('multiple overrides on the same preset', () => {
    const out = resolveFmplusPerms('financials_viewer', {
      shift_reports: 'submit',
      budget:        'view',
    });
    expect(out).toEqual({
      financials:    'view',
      budget:        'view',
      performance:   'view',
      shift_reports: 'submit',
      setup:         false,
    });
  });

  it('empty overrides object is equivalent to null', () => {
    expect(resolveFmplusPerms('site_manager', {})).toEqual(
      resolveFmplusPerms('site_manager', null),
    );
  });
});

describe('resolveFmplusPerms — unknown role fallback', () => {
  it('falls back to the most-restricted permission set when role is unrecognized', () => {
    const out = resolveFmplusPerms('unknown_role' as FmplusRolePreset, null);
    expect(out).toEqual({
      financials:    'none',
      budget:        'none',
      performance:   'none',
      shift_reports: 'none',
      setup:         false,
    });
  });
});
