// Canonical FM+ role presets + per-module permission matrix.
//
// Used by both the Settings UI (Create / Edit user forms) and any future
// enforcement code in FM+ modules. This file is pure data + a small resolver
// helper — no React, no server imports — so it can be safely imported from
// client components, server components, server actions, and tests alike.

export type FmplusRolePreset =
  | 'operations_manager'
  | 'site_manager'
  | 'shift_submitter'
  | 'budget_manager'
  | 'financials_viewer';

export type FinancialsLevel    = 'none' | 'view';
export type BudgetLevel        = 'none' | 'view' | 'edit';
export type PerformanceLevel   = 'none' | 'view';
export type ShiftReportsLevel  = 'none' | 'view' | 'submit' | 'configure';

/**
 * Per-module permissions for a single FM+ user. Each field is optional —
 * absent fields fall back to the user's preset defaults. Stored on
 * app_users.fmplus_perms (jsonb).
 */
export interface FmplusPerms {
  financials?:    FinancialsLevel;
  budget?:        BudgetLevel;
  performance?:   PerformanceLevel;
  shift_reports?: ShiftReportsLevel;
  /** Setup module is binary: false = cannot manage users, true = can. */
  setup?:         boolean;
}

/** A fully-resolved permission set (no optional fields). */
export interface ResolvedFmplusPerms {
  financials:    FinancialsLevel;
  budget:        BudgetLevel;
  performance:   PerformanceLevel;
  shift_reports: ShiftReportsLevel;
  setup:         boolean;
}

export interface FmplusRolePresetDef {
  key:      FmplusRolePreset;
  labelAr:  string;
  labelEn:  string;
  defaults: ResolvedFmplusPerms;
}

/** The 5 canonical presets, in display order (most-privileged → least). */
export const FMPLUS_ROLE_PRESETS: readonly FmplusRolePresetDef[] = [
  {
    key:     'operations_manager',
    labelAr: 'مدير العمليات',
    labelEn: 'Operations Manager',
    defaults: {
      financials:    'view',
      budget:        'edit',
      performance:   'view',
      shift_reports: 'configure',
      setup:         true,
    },
  },
  {
    key:     'site_manager',
    labelAr: 'مدير الموقع',
    labelEn: 'Site Manager',
    defaults: {
      financials:    'none',
      budget:        'view',
      performance:   'view',
      shift_reports: 'configure',
      setup:         false,
    },
  },
  {
    key:     'shift_submitter',
    labelAr: 'مُسجِّل الورديات',
    labelEn: 'Shift Submitter',
    defaults: {
      financials:    'none',
      budget:        'none',
      performance:   'view',
      shift_reports: 'submit',
      setup:         false,
    },
  },
  {
    key:     'budget_manager',
    labelAr: 'مدير الميزانية',
    labelEn: 'Budget Manager',
    defaults: {
      financials:    'view',
      budget:        'edit',
      performance:   'view',
      shift_reports: 'view',
      setup:         false,
    },
  },
  {
    key:     'financials_viewer',
    labelAr: 'مُطّلع على المالية',
    labelEn: 'Financials Viewer',
    defaults: {
      financials:    'view',
      budget:        'none',
      performance:   'view',
      shift_reports: 'none',
      setup:         false,
    },
  },
] as const;

/** Most-restricted fallback: no access to anything. Used when role is unrecognized. */
export const FMPLUS_PERMS_DENY_ALL: ResolvedFmplusPerms = {
  financials:    'none',
  budget:        'none',
  performance:   'none',
  shift_reports: 'none',
  setup:         false,
};

/**
 * Merge a preset's defaults with optional per-module overrides into a
 * fully-resolved permission set. Used by enforcement code (future Phase 2)
 * and by the Settings UI to display the "effective" permissions before save.
 *
 * - If `role` is unrecognized, returns the deny-all fallback.
 * - If `perms` is null or empty, returns the preset's defaults.
 * - Override fields that are present REPLACE the preset's defaults for that
 *   module; fields that are absent keep the preset's default.
 */
export function resolveFmplusPerms(
  role: FmplusRolePreset | null | undefined,
  perms: FmplusPerms | null | undefined,
): ResolvedFmplusPerms {
  const preset = FMPLUS_ROLE_PRESETS.find((p) => p.key === role);
  if (!preset) return { ...FMPLUS_PERMS_DENY_ALL };
  const base = preset.defaults;
  if (!perms) return { ...base };
  return {
    financials:    perms.financials    ?? base.financials,
    budget:        perms.budget        ?? base.budget,
    performance:   perms.performance   ?? base.performance,
    shift_reports: perms.shift_reports ?? base.shift_reports,
    setup:         perms.setup         ?? base.setup,
  };
}
