// src/lib/beithady/hr/hr-headcount-queries.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { calculateHKWeeks } from '@/lib/beithady/hk-calc';
import type { HKInputs, HKBaseData } from '@/lib/beithady/hc-estimator-types';
import type {
  GridCell, HcComparisonData, HcComparisonRow, HeadcountSnapshot, MonthlyAvgCell,
} from './hr-headcount-types';

// Operational buildings only (no HEAD_OFFICE / OTHER for HK comparison)
const OPS_BUILDINGS = ['BH-26', 'BH-73', 'BH-435', 'BH-OK'] as const;

// Default HK inputs — zeros for area hours / night shift (matching HC Estimator defaults)
const DEFAULT_HK_INPUTS: HKInputs = {
  multiplier: 1,
  buildings: {
    'BH-26':  { generalAreaHrsPerDay: 0, nightShiftHKs: 0 },
    'BH-73':  { generalAreaHrsPerDay: 0, nightShiftHKs: 0 },
    'BH-435': { generalAreaHrsPerDay: 0, nightShiftHKs: 0 },
    'BH-OK':  { generalAreaHrsPerDay: 0, nightShiftHKs: 0 },
  },
};

// ── Section 1: Live headcount grid ────────────────────────────────────────────

export async function getLiveHeadcount(): Promise<GridCell[]> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('hr_employees')
    .select('building_code, department')
    .eq('status', 'on_job');
  if (error) throw new Error(error.message);

  const map = new Map<string, number>();
  for (const e of (data ?? []) as { building_code: string | null; department: string }[]) {
    const bc = e.building_code ?? 'OTHER';
    const key = `${bc}__${e.department}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }

  return Array.from(map.entries()).map(([key, count]) => {
    const sep = key.indexOf('__');
    return { building_code: key.slice(0, sep), department: key.slice(sep + 2), count };
  });
}

// ── Section 2: HK + Security comparison vs HC Estimator planned ───────────────

export async function getHcComparison(): Promise<HcComparisonData> {
  const sb = supabaseAdmin();

  // Actual HK + Security on_job per operational building
  const { data: emps, error: eErr } = await sb
    .from('hr_employees')
    .select('building_code, department')
    .eq('status', 'on_job')
    .in('department', ['housekeeping', 'security'])
    .in('building_code', OPS_BUILDINGS as unknown as string[]);
  if (eErr) throw new Error(eErr.message);

  const hkMap  = new Map<string, number>();
  const secMap = new Map<string, number>();
  for (const e of (emps ?? []) as { building_code: string; department: string }[]) {
    if (e.department === 'housekeeping') {
      hkMap.set(e.building_code, (hkMap.get(e.building_code) ?? 0) + 1);
    } else {
      secMap.set(e.building_code, (secMap.get(e.building_code) ?? 0) + 1);
    }
  }

  const buildings: HcComparisonRow[] = OPS_BUILDINGS.map(b => ({
    building_code:    b,
    hk_actual:       hkMap.get(b) ?? 0,
    security_actual: secMap.get(b) ?? 0,
  }));

  const total_hk_actual       = buildings.reduce((s, b) => s + b.hk_actual, 0);
  const total_security_actual = buildings.reduce((s, b) => s + b.security_actual, 0);

  // Planned HK — load most recent HC Estimator snapshot and compute
  const { data: snap } = await sb
    .from('hc_estimator_snapshots')
    .select('data')
    .order('month_key', { ascending: false })
    .limit(1)
    .maybeSingle();

  let total_hk_planned: number | null = null;
  if (snap) {
    try {
      const result = calculateHKWeeks(snap.data as HKBaseData, DEFAULT_HK_INPUTS);
      total_hk_planned = result.grandTotalOnShift;
    } catch {
      // Malformed snapshot — leave planned as null
    }
  }

  return { buildings, total_hk_actual, total_hk_planned, total_security_actual };
}

// ── Section 3: Historical snapshots ──────────────────────────────────────────

export async function getHeadcountHistory(filters: {
  from?: string;   // YYYY-MM-DD
  to?: string;
  building_code?: string;
  department?: string;
} = {}): Promise<HeadcountSnapshot[]> {
  const sb = supabaseAdmin();

  let q = sb
    .from('hr_headcount_snapshots')
    .select('*')
    .order('date', { ascending: false })
    .order('building_code')
    .order('department');

  if (filters.from)          q = q.gte('date', filters.from);
  if (filters.to)            q = q.lte('date', filters.to);
  if (filters.building_code) q = q.eq('building_code', filters.building_code);
  if (filters.department)    q = q.eq('department', filters.department);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as HeadcountSnapshot[];
}

// ── Section 4: Monthly averages ──────────────────────────────────────────────

export async function getMonthlyAvgHeadcount(month: string): Promise<{
  rows: MonthlyAvgCell[];
  days_recorded: number;
}> {
  const sb = supabaseAdmin();
  const from = `${month}-01`;
  const to   = `${month}-31`;   // Supabase date filter handles month boundaries

  const { data, error } = await sb
    .from('hr_headcount_snapshots')
    .select('date, building_code, department, count')
    .gte('date', from)
    .lte('date', to);
  if (error) throw new Error(error.message);

  type Row = { date: string; building_code: string; department: string; count: number };
  const rows = (data ?? []) as Row[];

  const dates = new Set(rows.map(r => r.date));
  const days_recorded = dates.size;
  if (days_recorded === 0) return { rows: [], days_recorded: 0 };

  const sumMap = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.building_code}__${r.department}`;
    sumMap.set(key, (sumMap.get(key) ?? 0) + r.count);
  }

  const avgRows: MonthlyAvgCell[] = Array.from(sumMap.entries()).map(([key, total]) => {
    const sep = key.indexOf('__');
    return {
      building_code: key.slice(0, sep),
      department:    key.slice(sep + 2),
      avg_count:     Math.round((total / days_recorded) * 10) / 10,
    };
  });

  return { rows: avgRows, days_recorded };
}
