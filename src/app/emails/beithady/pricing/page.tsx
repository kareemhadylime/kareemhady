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
} from 'lucide-react';
import { TopNav } from '@/app/_components/brand';
import { SyncPills } from '@/app/_components/sync-pills';
import {
  buildPricingReport,
  type PricingListingRow,
  type PricingBuildingSummary,
} from '@/lib/pricelabs-pricing';
import { getSyncFreshness } from '@/lib/sync-freshness';
import { fmtCairoDateTime } from '@/lib/fmt-date';

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

export default async function PricingPage({
  searchParams,
}: {
  searchParams: Promise<{ building?: string; snapshot?: string }>;
}) {
  const sp = await searchParams;
  const [report, pills] = await Promise.all([
    buildPricingReport({ snapshotDate: sp.snapshot }),
    getSyncFreshness(['pricelabs', 'guesty']),
  ]);
  const buildingFilter = sp.building && sp.building !== 'all' ? sp.building : null;

  const filteredListings = buildingFilter
    ? report.listings.filter(r => r.building_code === buildingFilter)
    : report.listings;

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
            <TotalsBlock report={report} />

            <BuildingBreakdown
              buildings={report.by_building}
              activeBuilding={buildingFilter}
            />

            <ListingTable rows={filteredListings} activeBuilding={buildingFilter} />
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
}: {
  report: Awaited<ReturnType<typeof buildPricingReport>>;
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
        label="Occupancy (next 30d)"
        value={fmtPct(t.avg_occupancy_next_30)}
        sub={
          t.avg_market_occupancy_next_30 != null
            ? `market ${fmtPct(t.avg_market_occupancy_next_30)}`
            : 'no market baseline'
        }
        icon={<Zap size={18} className="text-rose-600" />}
      />
    </section>
  );
}

function BuildingBreakdown({
  buildings,
  activeBuilding,
}: {
  buildings: PricingBuildingSummary[];
  activeBuilding: string | null;
}) {
  return (
    <section className="ix-card p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <Building2 size={16} className="text-rose-600" />
          Per-building summary
        </h2>
        {activeBuilding && (
          <Link
            href="?"
            className="text-[11px] text-slate-500 hover:text-slate-800"
          >
            Clear filter
          </Link>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wide text-slate-500 bg-slate-50">
            <tr>
              <th className="text-left px-3 py-2">Building</th>
              <th className="text-right px-3 py-2" title="PriceLabs items (parents + singles)">Listings</th>
              <th className="text-right px-3 py-2" title="Σ physical units (multi-unit parents expanded)">Phys. Units</th>
              <th className="text-right px-3 py-2" title="Multi-unit parent listings (manage N sub-units each)">MTL Parents</th>
              <th className="text-right px-3 py-2">Pushing</th>
              <th className="text-right px-3 py-2">Avg Base</th>
              <th className="text-right px-3 py-2">Avg ADR (30d)</th>
              <th className="text-right px-3 py-2">Revenue (30d)</th>
              <th className="text-right px-3 py-2">YoY</th>
              <th className="text-right px-3 py-2">Occ next-30</th>
              <th className="text-right px-3 py-2">vs Market</th>
            </tr>
          </thead>
          <tbody>
            {buildings.map(b => {
              const isActive = activeBuilding === b.building_code;
              return (
                <tr
                  key={b.building_code}
                  className={`border-t border-slate-100 ${
                    isActive ? 'bg-rose-50/40' : 'hover:bg-slate-50/60'
                  }`}
                >
                  <td className="px-3 py-2 font-medium">
                    <Link
                      href={`?building=${encodeURIComponent(b.building_code)}`}
                      className="hover:text-rose-700"
                    >
                      {b.building_code}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {b.listings}
                  </td>
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
                  <td className="px-3 py-2 text-right tabular-nums">
                    {fmtPct(b.avg_occupancy_next_30)}
                  </td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${
                      b.occupancy_delta_30 == null
                        ? 'text-slate-400'
                        : b.occupancy_delta_30 >= 0
                          ? 'text-emerald-600'
                          : 'text-rose-600'
                    }`}
                  >
                    {b.occupancy_delta_30 == null
                      ? '—'
                      : `${b.occupancy_delta_30 >= 0 ? '+' : ''}${fmt1(b.occupancy_delta_30)} pp`}
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

function ListingTable({
  rows,
  activeBuilding,
}: {
  rows: PricingListingRow[];
  activeBuilding: string | null;
}) {
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
              <th className="text-right px-3 py-2">Occ 30d</th>
              <th className="text-right px-3 py-2">Mkt</th>
              <th className="text-right px-3 py-2">Δ</th>
              <th className="text-right px-3 py-2">Rec Base</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
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
                  {fmtPct(r.occupancy_next_30)}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                  {fmtPct(r.market_occupancy_next_30)}
                </td>
                <td
                  className={`px-3 py-1.5 text-right tabular-nums text-[11px] ${
                    r.occupancy_30_delta == null
                      ? 'text-slate-400'
                      : r.occupancy_30_delta >= 0
                        ? 'text-emerald-600'
                        : 'text-rose-600'
                  }`}
                >
                  {r.occupancy_30_delta == null
                    ? '—'
                    : `${r.occupancy_30_delta >= 0 ? '+' : ''}${fmt1(r.occupancy_30_delta)}`}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {r.rec_base_unavailable ? (
                    <span className="text-[11px] text-amber-600">Unavail</span>
                  ) : (
                    fmt(r.recommended_base_price)
                  )}
                </td>
              </tr>
            ))}
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
