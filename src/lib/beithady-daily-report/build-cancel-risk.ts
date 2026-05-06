// NOTE: There is no `cancel_risk_v` view in this repo. The cancel-risk page
// at /beithady/operations/cancel-risk uses a two-step join:
//   1. beithady_reservation_grid_v  — reservation + listing metadata
//   2. beithady_reservation_overrides — per-reservation cancel_risk_score
// We replicate the same pattern here (see src/lib/beithady/operations/cancel-risk.ts).
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { CancelRiskSection } from './types';

const MIN_SCORE = 50;
const DAYS_FORWARD = 21;

/**
 * Reads cancel-risk reservations matching the same filter as
 * /beithady/operations/cancel-risk (score >= 50, check-in within next 21d).
 * Returns null on error so the dashboard renders a graceful fallback.
 */
export async function buildCancelRisk(today: string): Promise<CancelRiskSection | null> {
  try {
    const sb = supabaseAdmin();
    const horizonIso = new Date(new Date(today + 'T00:00:00Z').getTime() + DAYS_FORWARD * 86400_000)
      .toISOString()
      .slice(0, 10);

    // Step 1: fetch upcoming non-cancelled reservations from the grid view.
    const { data: grid, error: gridErr } = await sb
      .from('beithady_reservation_grid_v')
      .select('reservation_id, listing_nickname, building_code, guest_name, check_in_date')
      .gte('check_in_date', today)
      .lte('check_in_date', horizonIso)
      .neq('status', 'canceled');

    if (gridErr) {
      console.warn('[build-cancel-risk] grid query error:', gridErr.message);
      return null;
    }

    const ids = ((grid as Array<{ reservation_id: string }> | null) ?? []).map(r => r.reservation_id);
    if (ids.length === 0) return { count: 0, value_at_risk_usd: 0, reservations: [] };

    // Step 2: fetch override rows that have a qualifying cancel_risk_score.
    const { data: overrides, error: ovErr } = await sb
      .from('beithady_reservation_overrides')
      .select('reservation_id, cancel_risk_score, cancel_risk_breakdown')
      .in('reservation_id', ids)
      .gte('cancel_risk_score', MIN_SCORE)
      .order('cancel_risk_score', { ascending: false });

    if (ovErr) {
      console.warn('[build-cancel-risk] overrides query error:', ovErr.message);
      return null;
    }

    type GridRow = {
      reservation_id: string;
      listing_nickname: string | null;
      building_code: string | null;
      guest_name: string | null;
      check_in_date: string;
    };
    type OverrideRow = {
      reservation_id: string;
      cancel_risk_score: number;
      cancel_risk_breakdown: Record<string, number> | null;
    };

    const gridById = new Map<string, GridRow>();
    for (const r of (grid as GridRow[] | null) ?? []) {
      gridById.set(r.reservation_id, r);
    }

    const reservations: CancelRiskSection['reservations'] = [];
    let valueAtRisk = 0;

    for (const o of (overrides as OverrideRow[] | null) ?? []) {
      const g = gridById.get(o.reservation_id);
      if (!g) continue;

      // Derive a simple estimated value from the breakdown sums (if present).
      // The operations page doesn't expose a single value_usd field, so we
      // compute it as the sum of breakdown sub-scores or 0 as a safe default.
      const value = o.cancel_risk_breakdown
        ? Object.values(o.cancel_risk_breakdown).reduce((s, v) => s + Math.abs(Number(v)), 0)
        : 0;

      valueAtRisk += value;
      reservations.push({
        code: o.reservation_id ?? null,
        unit: g.listing_nickname ?? g.building_code ?? '—',
        guest: g.guest_name ?? null,
        check_in: g.check_in_date ?? null,
        score: Number(o.cancel_risk_score),
        value_usd: value,
      });
    }

    return {
      count: reservations.length,
      value_at_risk_usd: valueAtRisk,
      reservations,
    };
  } catch (err) {
    console.warn('[build-cancel-risk] exception', err);
    return null;
  }
}
