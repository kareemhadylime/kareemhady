// Pure types + helpers. No imports. Safe for any context.

// ── DB row shape ──────────────────────────────────────────────────────────────

export type HeadcountSnapshot = {
  id: string;
  date: string;           // YYYY-MM-DD
  building_code: string;
  department: string;
  count: number;
  recorded_at: string;
};

// ── Live grid ─────────────────────────────────────────────────────────────────

export type GridCell = {
  building_code: string;
  department: string;
  count: number;
};

// ── HC comparison ─────────────────────────────────────────────────────────────

// Per-building actual counts (HK + Security)
export type HcComparisonRow = {
  building_code: string;
  hk_actual: number;
  security_actual: number;
};

// Portfolio-level: per-building actuals + total planned HK from HC Estimator
export type HcComparisonData = {
  buildings: HcComparisonRow[];
  total_hk_actual: number;
  total_hk_planned: number | null;   // null if no hc_estimator_snapshots row exists
  total_security_actual: number;
};

// ── Monthly averages ──────────────────────────────────────────────────────────

export type MonthlyAvgCell = {
  building_code: string;
  department: string;
  avg_count: number;   // rounded to 1 decimal place
};

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Returns actual - planned, or null if planned is unknown.
 * Positive = over-staffed, negative = under-staffed.
 */
export function calcHcDelta(actual: number, planned: number | null): number | null {
  if (planned === null) return null;
  return actual - planned;
}
