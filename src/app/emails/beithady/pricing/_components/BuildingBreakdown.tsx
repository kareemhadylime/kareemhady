'use client';

import { useState } from 'react';
import { Building2 } from 'lucide-react';
import { BuildingDetailModal } from './BuildingDetailModal';
import type {
  PricingBuildingSummary,
  PricingHorizon,
  PricingListingRow,
} from '@/lib/pricelabs-pricing';

const fmt = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Math.round(Number(n)).toLocaleString('en-US');
};
const fmt1 = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toFixed(1);
};
const fmtPct = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return `${Number(n).toFixed(1)}%`;
};

function pickOccupancy(
  b: PricingBuildingSummary,
  horizon: PricingHorizon
): { occ: number | null; mkt: number | null; delta: number | null } {
  if (horizon === 7) {
    return {
      occ: b.avg_occupancy_next_7,
      mkt: b.avg_market_occupancy_next_7,
      delta: b.occupancy_delta_7,
    };
  }
  if (horizon === 60) {
    return {
      occ: b.avg_occupancy_next_60,
      mkt: b.avg_market_occupancy_next_60,
      delta: b.occupancy_delta_60,
    };
  }
  return {
    occ: b.avg_occupancy_next_30,
    mkt: b.avg_market_occupancy_next_30,
    delta: b.occupancy_delta_30,
  };
}

export function BuildingBreakdown({
  buildings,
  listings,
  horizon,
}: {
  buildings: PricingBuildingSummary[];
  listings: PricingListingRow[];
  horizon: PricingHorizon;
}) {
  const [selected, setSelected] = useState<string | null>(null);

  // Cache units per building so the modal doesn't re-filter on every open.
  const byBuilding = buildings.reduce<Record<string, PricingListingRow[]>>(
    (acc, b) => {
      acc[b.building_code] = listings.filter(l =>
        b.building_code === 'untagged'
          ? !l.building_code
          : l.building_code === b.building_code
      );
      return acc;
    },
    {}
  );

  return (
    <section className="ix-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Building2 size={16} className="text-rose-600" />
          Per-building summary
        </h2>
        <span className="text-[11px] text-slate-500">
          Click a building to see its units · occupancy shown for next {horizon}d
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-slate-500 bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2">Building</th>
              <th className="text-right px-3 py-2" title="PriceLabs items (parents + singles)">Listings</th>
              <th className="text-right px-3 py-2" title="Σ physical units (multi-unit parents expanded)">Phys. Units</th>
              <th className="text-right px-3 py-2" title="Multi-unit parent listings">MTL Parents</th>
              <th className="text-right px-3 py-2">Pushing</th>
              <th className="text-right px-3 py-2">Avg Base</th>
              <th className="text-right px-3 py-2">Avg ADR (30d)</th>
              <th className="text-right px-3 py-2">Revenue (30d)</th>
              <th className="text-right px-3 py-2">YoY</th>
              <th className="text-right px-3 py-2">Occ next-{horizon}</th>
              <th className="text-right px-3 py-2">vs Market</th>
            </tr>
          </thead>
          <tbody>
            {buildings.map(b => {
              const { occ, delta } = pickOccupancy(b, horizon);
              return (
                <tr
                  key={b.building_code}
                  onClick={() => setSelected(b.building_code)}
                  className="border-t border-slate-100 hover:bg-rose-50/40 cursor-pointer transition"
                >
                  <td className="px-3 py-2 font-medium text-rose-700 underline-offset-4 hover:underline">
                    {b.building_code}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{b.listings}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {b.physical_units}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {b.multi_unit_parents}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                    {b.units_pushing}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmt(b.avg_base)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmt(b.avg_adr_past_30)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmt(b.total_revenue_past_30)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      b.revenue_yoy_pct == null
                        ? 'text-slate-400'
                        : b.revenue_yoy_pct >= 0
                          ? 'text-emerald-600'
                          : 'text-rose-600'
                    }`}
                  >
                    {b.revenue_yoy_pct == null
                      ? '—'
                      : `${b.revenue_yoy_pct >= 0 ? '+' : ''}${fmt1(b.revenue_yoy_pct)}%`}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtPct(occ)}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      delta == null
                        ? 'text-slate-400'
                        : delta >= 0
                          ? 'text-emerald-600'
                          : 'text-rose-600'
                    }`}
                  >
                    {delta == null
                      ? '—'
                      : `${delta >= 0 ? '+' : ''}${fmt1(delta)} pp`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && byBuilding[selected] && (
        <BuildingDetailModal
          buildingCode={selected}
          horizon={horizon}
          units={byBuilding[selected]}
          onClose={() => setSelected(null)}
        />
      )}
    </section>
  );
}
