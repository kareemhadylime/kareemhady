import Link from 'next/link';
import {
  ChevronRight,
  RefreshCcw,
  TrendingUp,
  TrendingDown,
  Building2,
  DollarSign,
  BarChart3,
  Zap,
  CalendarDays,
} from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { SyncPills } from '@/app/_components/sync-pills';
import {
  buildPricingReport,
  type PricingListingRow,
  type PricingHorizon,
} from '@/lib/pricelabs-pricing';
import { getSyncFreshness } from '@/lib/sync-freshness';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import { BuildingBreakdown } from './_components/BuildingBreakdown';
import { PricingHorizonTab, SnapshotDateLink } from './_components/PricingControls';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

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

function parseHorizon(s: string | undefined): PricingHorizon {
  if (s === '7') return 7;
  if (s === '60') return 60;
  return 30;
}

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ building?: string; snapshot?: string; horizon?: string }>;
}) {
  const sp = await searchParams;
  const horizon: PricingHorizon = parseHorizon(sp.horizon);
  const [report, pills] = await Promise.all([
    buildPricingReport({ snapshotDate: sp.snapshot }),
    getSyncFreshness(['pricelabs', 'guesty']),
  ]);
  const buildingFilter = sp.building && sp.building !== 'all' ? sp.building : null;

  const filteredListings = buildingFilter
    ? report.listings.filter(r => r.building_code === buildingFilter)
    : report.listings;

  // Pick the right occupancy pair based on horizon for the top StatCard.
  const occFromTotals =
    horizon === 7
      ? {
          occ: report.totals.avg_occupancy_next_7,
          mkt: report.totals.avg_market_occupancy_next_7,
        }
      : horizon === 60
        ? {
            occ: report.totals.avg_occupancy_next_60,
            mkt: report.totals.avg_market_occupancy_next_60,
          }
        : {
            occ: report.totals.avg_occupancy_next_30,
            mkt: report.totals.avg_market_occupancy_next_30,
          };

  return (
    <>
      <TopNav>
        <Link href="/emails" className="ix-link">
          Emails
        </Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/emails/beithady" className="ix-link">
          BEITHADY
        </Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Pricing</span>
      </TopNav>

      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8 flex-1">
        <header className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
              BEITHADY · Pricing Intelligence
            </p>
            <h1 className="text-3xl font-bold tracking-tight">
              PriceLabs Revenue Dashboard
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Per-listing ADR, revenue vs STLY, occupancy vs market for the next
              7/30/60 days. Snapshot date:{' '}
              <strong>{report.snapshot_date || '—'}</strong>.
            </p>
            <div className="mt-2"><SyncPills pills={pills} /></div>
          </div>
          <div className="text-right text-xs text-slate-500 space-y-1">
            {report.latest_sync ? (
              <>
                <p className="flex items-center gap-1.5 justify-end">
                  <RefreshCcw size={12} />
                  Synced{' '}
                  {report.latest_sync.finished_at
                    ? fmtCairoDateTime(report.latest_sync.finished_at)
                    : '—'}
                </p>
                <p className="text-[11px]">
                  {report.latest_sync.listings_synced} listings ·{' '}
                  {report.latest_sync.snapshots_written} snapshots
                </p>
              </>
            ) : (
              <p>No sync yet.</p>
            )}
          </div>
        </header>

        {report.total_listings === 0 ? (
          <EmptyState />
        ) : (
          <>
            <PeriodControlsSection
              horizon={horizon}
              snapshotDate={report.snapshot_date}
              availableSnapshotDates={report.available_snapshot_dates}
              buildingFilter={buildingFilter}
            />

            <TotalsBlock report={report} horizon={horizon} occ={occFromTotals} />

            <BuildingBreakdown
              buildings={report.by_building}
              listings={report.listings}
              horizon={horizon}
            />

            <ListingTable
              rows={filteredListings}
              activeBuilding={buildingFilter}
              horizon={horizon}
            />
          </>
        )}

        <footer className="text-[11px] text-slate-400 border-t border-slate-200 pt-4">
          Data sourced from PriceLabs via GET /listings/{'{id}'}. Cron runs
          daily at 04:35 UTC. Rate limit: ~60 req/min/key · 69 listings ×
          400ms throttle ≈ 30s per run.
        </footer>
      </main>
    </>
  );
}

function TotalsBlock({
  report,
  horizon,
  occ,
}: {
  report: Awaited<ReturnType<typeof buildPricingReport>>;
  horizon: PricingHorizon;
  occ: { occ: number | null; mkt: number | null };
}) {
  const t = report.totals;
  const physicalUnits = report.listings.reduce((s, r) => s + r.unit_count, 0);
  const mtlParents = report.listings.filter(r => r.is_multi_unit_parent).length;
  return (
    <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        label="Physical Units"
        value={`${physicalUnits}`}
        sub={`${report.total_listings} listings · ${mtlParents} MTL parents`}
        icon={<Building2 size={18} className="text-indigo-600" />}
      />
      <StatCard
        label="Avg ADR (past 30d)"
        value={fmt(t.avg_adr_past_30)}
        sub="USD per unit"
        icon={<DollarSign size={18} className="text-emerald-600" />}
      />
      <StatCard
        label="Revenue (past 30d)"
        value={fmt(t.total_revenue_past_30)}
        sub={
          t.revenue_yoy_pct == null
            ? 'no STLY baseline'
            : `${t.revenue_yoy_pct >= 0 ? '+' : ''}${fmt1(t.revenue_yoy_pct)}% YoY`
        }
        icon={<BarChart3 size={18} className="text-amber-600" />}
        tone={
          t.revenue_yoy_pct == null
            ? 'neutral'
            : t.revenue_yoy_pct >= 0
              ? 'positive'
              : 'negative'
        }
      />
      <StatCard
        label={`Occupancy (next ${horizon}d)`}
        value={fmtPct(occ.occ)}
        sub={
          occ.mkt != null ? `market ${fmtPct(occ.mkt)}` : 'no market baseline'
        }
        icon={<Zap size={18} className="text-rose-600" />}
      />
    </section>
  );
}

function PeriodControlsSection({
  horizon,
  snapshotDate,
  availableSnapshotDates,
  buildingFilter,
}: {
  horizon: PricingHorizon;
  snapshotDate: string;
  availableSnapshotDates: string[];
  buildingFilter: string | null;
}) {
  const buildHref = (overrides: {
    horizon?: PricingHorizon;
    snapshot?: string;
  }): string => {
    const params = new URLSearchParams();
    const h = overrides.horizon ?? horizon;
    if (h !== 30) params.set('horizon', String(h));
    const snap = 'snapshot' in overrides ? overrides.snapshot : snapshotDate;
    if (snap && snap !== availableSnapshotDates[0]) {
      params.set('snapshot', snap);
    }
    if (buildingFilter) params.set('building', buildingFilter);
    const qs = params.toString();
    return qs ? `?${qs}` : '?';
  };

  // Short-list the snapshots the user is likely to pick: today (latest),
  // yesterday, 7 days ago, 30 days ago — anything actually present in the
  // available dates list. Extra dates reachable via the full dropdown.
  const topDates = availableSnapshotDates.slice(0, 1);
  const yesterday = availableSnapshotDates.find((_, i) => i === 1);
  const weekAgo = availableSnapshotDates.find((_, i) => i === 7);
  const monthAgo = availableSnapshotDates.find((_, i) => i === 29);
  const shortcutDates: Array<{ value: string; label: string }> = [
    ...topDates.map(d => ({ value: d, label: 'Latest' })),
    ...(yesterday ? [{ value: yesterday, label: 'Yesterday' }] : []),
    ...(weekAgo ? [{ value: weekAgo, label: '1 week ago' }] : []),
    ...(monthAgo ? [{ value: monthAgo, label: '30 days ago' }] : []),
  ];

  return (
    <section className="ix-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <CalendarDays size={16} className="text-rose-600" />
        <h2 className="text-sm font-semibold">Period</h2>
        <span className="text-[11px] text-slate-500">
          forward horizon · snapshot date
        </span>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1.5">
            Forward horizon
          </p>
          <div className="flex flex-wrap gap-2">
            {([7, 30, 60] as const).map(h => (
              <PricingHorizonTab
                key={h}
                href={buildHref({ horizon: h })}
                label={`Next ${h} days`}
                active={horizon === h}
              />
            ))}
          </div>
        </div>

        <div>
          <p className="text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1.5">
            Snapshot date ·{' '}
            <span className="normal-case text-slate-700 font-semibold">
              {snapshotDate}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {shortcutDates.map(d => (
              <SnapshotDateLink
                key={d.value}
                href={buildHref({ snapshot: d.value })}
                label={`${d.label} · ${d.value}`}
                active={snapshotDate === d.value}
              />
            ))}
            <form className="flex items-center gap-2" action="" method="get">
              {horizon !== 30 && (
                <input type="hidden" name="horizon" value={String(horizon)} />
              )}
              {buildingFilter && (
                <input type="hidden" name="building" value={buildingFilter} />
              )}
              <select
                name="snapshot"
                defaultValue={snapshotDate}
                className="ix-input text-xs w-[160px] py-1"
              >
                {availableSnapshotDates.map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="px-2.5 py-1 rounded text-xs font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition"
              >
                Go
              </button>
            </form>
          </div>
        </div>
      </div>
    </section>
  );
}

// BuildingBreakdown lives in _components/BuildingBreakdown.tsx (client) so
// rows can open a per-building modal. Imported at the top of this file.

function ListingTable({
  rows,
  activeBuilding,
  horizon,
}: {
  rows: PricingListingRow[];
  activeBuilding: string | null;
  horizon: PricingHorizon;
}) {
  const pick = (r: PricingListingRow) => {
    if (horizon === 7) {
      return {
        occ: r.occupancy_next_7,
        mkt: r.market_occupancy_next_7,
        delta:
          r.occupancy_next_7 != null && r.market_occupancy_next_7 != null
            ? r.occupancy_next_7 - r.market_occupancy_next_7
            : null,
      };
    }
    if (horizon === 60) {
      return {
        occ: r.occupancy_next_60,
        mkt: r.market_occupancy_next_60,
        delta:
          r.occupancy_next_60 != null && r.market_occupancy_next_60 != null
            ? r.occupancy_next_60 - r.market_occupancy_next_60
            : null,
      };
    }
    return {
      occ: r.occupancy_next_30,
      mkt: r.market_occupancy_next_30,
      delta: r.occupancy_30_delta,
    };
  };
  return (
    <section className="ix-card overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100">
        <h2 className="text-sm font-semibold">
          Listings · {rows.length}
          {activeBuilding ? ` · ${activeBuilding}` : ''}
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-slate-500 bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2">Listing</th>
              <th className="text-left px-3 py-2">Bldg</th>
              <th className="text-center px-3 py-2" title="Multi-unit parent manages N sub-listings">Units</th>
              <th className="text-center px-3 py-2">Push</th>
              <th className="text-right px-3 py-2">Base</th>
              <th className="text-right px-3 py-2">ADR 30d</th>
              <th className="text-right px-3 py-2">YoY</th>
              <th className="text-right px-3 py-2">Rev 30d</th>
              <th className="text-right px-3 py-2">Occ {horizon}d</th>
              <th className="text-right px-3 py-2">Mkt</th>
              <th className="text-right px-3 py-2">Δ</th>
              <th className="text-right px-3 py-2">Rec Base</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => {
              const { occ, mkt, delta } = pick(r);
              return (
              <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                <td className="px-3 py-1.5 truncate max-w-[240px]" title={r.name}>
                  {r.name}
                </td>
                <td className="px-3 py-1.5 text-[11px] font-medium text-slate-600">
                  {r.building_code || '—'}
                </td>
                <td className="px-3 py-1.5 text-center">
                  {r.is_multi_unit_parent ? (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700"
                      title={`Multi-unit parent · ${r.unit_count} sub-units`}
                    >
                      {r.unit_count}×
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-400">1</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-center">
                  {r.push_enabled === true ? (
                    <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                  ) : r.push_enabled === false ? (
                    <span className="inline-block w-2 h-2 rounded-full bg-slate-300" />
                  ) : (
                    <span className="text-slate-300">—</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.base)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.adr_past_30)}</td>
                <td
                  className={`px-3 py-1.5 text-right tabular-nums text-[11px] ${
                    r.adr_yoy_pct == null
                      ? 'text-slate-400'
                      : r.adr_yoy_pct >= 0
                        ? 'text-emerald-600'
                        : 'text-rose-600'
                  }`}
                >
                  {r.adr_yoy_pct == null
                    ? '—'
                    : `${r.adr_yoy_pct >= 0 ? '+' : ''}${fmt1(r.adr_yoy_pct)}%`}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.revenue_past_30)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {fmtPct(occ)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                  {fmtPct(mkt)}
                </td>
                <td
                  className={`px-3 py-1.5 text-right tabular-nums text-[11px] ${
                    delta == null
                      ? 'text-slate-400'
                      : delta >= 0
                        ? 'text-emerald-600'
                        : 'text-rose-600'
                  }`}
                >
                  {delta == null
                    ? '—'
                    : `${delta >= 0 ? '+' : ''}${fmt1(delta)}`}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {r.rec_base_unavailable ? (
                    <span className="text-[11px] text-amber-600">Unavail</span>
                  ) : (
                    fmt(r.recommended_base_price)
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  sub: string;
  icon: React.ReactNode;
  tone?: 'positive' | 'negative' | 'neutral';
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-emerald-600'
      : tone === 'negative'
        ? 'text-rose-600'
        : 'text-slate-900';
  const TrendIcon =
    tone === 'positive' ? TrendingUp : tone === 'negative' ? TrendingDown : null;
  return (
    <div className="ix-card p-4 space-y-1">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 font-medium">{label}</p>
        {icon}
      </div>
      <p className={`text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      <p className="text-[11px] text-slate-500 flex items-center gap-1">
        {TrendIcon && <TrendIcon size={11} />}
        {sub}
      </p>
    </div>
  );
}

function EmptyState() {
  return (
    <section className="ix-card p-10 text-center space-y-2">
      <h2 className="text-lg font-semibold">No PriceLabs data yet</h2>
      <p className="text-sm text-slate-500">
        Run the sync with:{' '}
        <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">
          curl -H "Authorization: Bearer $CRON_SECRET" -X POST
          https://kareemhady.vercel.app/api/pricelabs/run-now
        </code>
      </p>
      <p className="text-xs text-slate-400">
        Or wait for the daily cron at 04:35 UTC.
      </p>
    </section>
  );
}
