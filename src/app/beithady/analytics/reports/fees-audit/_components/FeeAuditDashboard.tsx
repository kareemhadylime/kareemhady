'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Globe2, Calendar, Building2, Filter as FilterIcon, ToggleLeft, RefreshCw } from 'lucide-react';
import type {
  FeeAuditConfig,
  FeeAuditData,
  FeeCategory,
  BuildingCode,
} from '@/lib/beithady/fees-audit/types';
import { FEE_CATEGORY_LABEL } from '@/lib/beithady/fees-audit/types';
import type { ChannelBucket } from '@/lib/beithady/guesty-metrics';
import { Sidebar } from './Sidebar';
import { KpiStrip } from './KpiStrip';
import { Heatmap } from './Heatmap';
import { CrossRefTable } from './CrossRefTable';
import { AnomalyInspector } from './AnomalyInspector';
import { QuoteCalculator } from './QuoteCalculator';
import { TaxStackTester } from './TaxStackTester';
import { VendorExportDialog } from './VendorExportDialog';
import { CellDrillThroughModal } from './CellDrillThroughModal';
import { ChannelCompareModal } from './ChannelCompareModal';
import {
  BHDashboardShell,
  BHTitleBar,
  type BHTitleBarChip,
} from '@/app/beithady/_components/dashboard-shell';

// Country category presets — picking a country category in the sidebar
// auto-applies a building filter so the rest of the dashboard re-renders
// scoped to that country. BH-DXB is the UAE listing; everything else =
// Egypt portfolio (BH-26 / BH-73 / BH-435 / BH-OK / OTHER).
const COUNTRY_BUILDINGS: Record<string, BuildingCode[] | null> = {
  country_egypt: ['BH-26', 'BH-73', 'BH-435', 'BH-OK', 'OTHER'],
  country_uae: ['BH-DXB'],
  country_split: null, // null = show all, dashboard renders side-by-side
};

function isCountryCategory(c: FeeCategory): boolean {
  return c === 'country_egypt' || c === 'country_uae' || c === 'country_split';
}
function isAnalyticCategory(c: FeeCategory): boolean {
  return (
    c === 'analytic_bedroom_class' ||
    c === 'analytic_building' ||
    c === 'analytic_channel_mix' ||
    c === 'analytic_capacity'
  );
}

const CHANNEL_LABEL: Record<string, string> = {
  airbnb: 'Airbnb',
  booking_com: 'Booking',
  other_ota: 'Other OTA',
  manual: 'Manual',
};

const PRICE_MODE_LABEL: Record<string, string> = {
  host_net: 'Host Net',
  guest_gross: 'Guest Gross',
  both: 'Both',
};

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso + 'T00:00:00Z');
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

function endDate(start: string, windowDays: number): string {
  const d = new Date(start + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + windowDays - 1);
  return fmtDate(d.toISOString().slice(0, 10));
}

export function FeeAuditDashboard({
  initialStartDate,
}: {
  initialStartDate: string;
}) {
  const [config, setConfig] = useState<FeeAuditConfig>({
    buildings: [] as BuildingCode[],
    startDate: initialStartDate,
    windowDays: 7,
    channels: [] as ChannelBucket[],
    priceMode: 'both',
    selectedFeeCategory: 'daily_rate' as FeeCategory,
  });
  const [data, setData] = useState<FeeAuditData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [drill, setDrill] = useState<{ listingId: string; date: string } | null>(null);
  const [compare, setCompare] = useState<string | null>(null);
  const [showVendorExport, setShowVendorExport] = useState(false);
  const [showTaxTester, setShowTaxTester] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => runReport(), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify({ ...config, selectedFeeCategory: undefined })]);

  async function runReport() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/beithady/fees-audit/run', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ config }),
      });
      const json = (await res.json()) as { data?: FeeAuditData; error?: string };
      if (json.error) throw new Error(json.error);
      setData(json.data || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  const drillCell = useMemo(() => {
    if (!drill || !data) return null;
    return data.daily.find(
      d => d.listing_id === drill.listingId && d.date === drill.date
    ) || null;
  }, [drill, data]);

  const buildingsLabel =
    config.buildings.length === 0
      ? 'All buildings'
      : config.buildings.length <= 3
        ? config.buildings.join(' · ')
        : `${config.buildings.length} buildings`;
  const channelsLabel =
    config.channels.length === 0
      ? 'All channels'
      : config.channels.map((c) => CHANNEL_LABEL[c] || c).join(' + ');
  const dateRangeLabel = `${fmtDate(config.startDate)} → ${endDate(config.startDate, config.windowDays)}`;

  const chips: BHTitleBarChip[] = [
    { icon: Calendar, label: dateRangeLabel },
    { icon: Building2, label: buildingsLabel },
    { icon: FilterIcon, label: channelsLabel },
    { icon: ToggleLeft, label: PRICE_MODE_LABEL[config.priceMode] },
  ];

  const titleBarActions = (
    <div className="flex flex-col items-end gap-1">
      {loading && (
        <RefreshCw size={16} className="animate-spin" style={{ color: 'var(--bh-gold)' }} />
      )}
      {data?.totals?.physical_units != null && (
        <div className="text-right">
          <div
            className="text-3xl font-bold"
            style={{ color: 'var(--bh-gold)', fontFamily: 'Cormorant Garamond, Playfair Display, Georgia, serif' }}
          >
            {data.totals.physical_units}
          </div>
          <div className="text-[10px] uppercase tracking-wider" style={{ color: '#cbd5e1' }}>
            units in scope
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
      <BHDashboardShell
        titleBar={
          <BHTitleBar
            eyebrow="Booking-Channel Fee Audit"
            title={`${config.windowDays}-day forward · ${FEE_CATEGORY_LABEL[config.selectedFeeCategory]}`}
            chips={chips}
            actions={titleBarActions}
          />
        }
        rail={
          <Sidebar
            open={sidebarOpen}
            onToggle={() => setSidebarOpen((o) => !o)}
            selected={config.selectedFeeCategory}
            onSelect={(cat) => {
              // Country categories ALSO change the building filter so the data
              // re-fetches scoped to that country. Analytic categories are
              // pivot-only — they don't refetch, just resort the cross-ref view.
              if (isCountryCategory(cat)) {
                const next = COUNTRY_BUILDINGS[cat];
                setConfig({
                  ...config,
                  selectedFeeCategory: cat,
                  buildings: next === null ? [] : next, // [] = all
                });
              } else {
                setConfig({ ...config, selectedFeeCategory: cat });
              }
            }}
            config={config}
            onConfigChange={setConfig}
            onOpenTaxTester={() => setShowTaxTester(true)}
            onOpenVendorExport={() => setShowVendorExport(true)}
          />
        }
      >
        <div className="col-span-12 space-y-4">
          {error ? (
            <div className="ix-card p-4 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 text-sm">
              Error: {error}
            </div>
          ) : null}

          {!data && loading ? (
            <div className="ix-card p-12 text-center text-slate-500 dark:text-slate-400">
              <Loader2 className="inline animate-spin" size={20} />
              <span className="ml-2">Building fee audit…</span>
            </div>
          ) : null}

          {data ? (
            <>
              {/* Country / Analytic mode banner — shows operator what extra
                  scoping is active so the changed numbers don't surprise. */}
              {isCountryCategory(config.selectedFeeCategory) ||
              isAnalyticCategory(config.selectedFeeCategory) ? (
                <div
                  className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm"
                  style={{
                    background: 'var(--bh-cream)',
                    border: '1px solid var(--bh-gold)',
                    color: 'var(--bh-ink)',
                  }}
                >
                  <Globe2 size={14} style={{ color: 'var(--bh-gold)' }} />
                  <span className="font-semibold">
                    {config.selectedFeeCategory === 'country_egypt' && 'Scoped to Egypt portfolio (BH-26 · BH-73 · BH-435 · BH-OK)'}
                    {config.selectedFeeCategory === 'country_uae' && 'Scoped to UAE portfolio (BH-DXB)'}
                    {config.selectedFeeCategory === 'country_split' && 'All countries (Egypt + UAE) — see country split in cross-ref'}
                    {config.selectedFeeCategory === 'analytic_bedroom_class' && 'Pivoting cross-ref by bedroom class'}
                    {config.selectedFeeCategory === 'analytic_building' && 'Pivoting cross-ref by building'}
                    {config.selectedFeeCategory === 'analytic_channel_mix' && 'Pivoting cross-ref by channel mix'}
                    {config.selectedFeeCategory === 'analytic_capacity' && 'Pivoting cross-ref by capacity (accommodates)'}
                  </span>
                  <span className="ml-auto text-xs" style={{ color: 'var(--bh-steel)' }}>
                    {data.listings.length} units in scope
                  </span>
                </div>
              ) : null}

              <KpiStrip data={data} />

              <QuoteCalculator listings={data.listings} />

              <Heatmap
                data={data}
                category={config.selectedFeeCategory}
                onCellClick={(listingId, date) => setDrill({ listingId, date })}
              />

              <CrossRefTable
                data={data}
                priceMode={config.priceMode}
                pivotMode={isAnalyticCategory(config.selectedFeeCategory) ? config.selectedFeeCategory : null}
                onCompareChannels={(listingId) => setCompare(listingId)}
              />

              <AnomalyInspector anomalies={data.anomalies} />

              {data.warnings?.length ? (
                <div className="ix-card p-3 text-xs text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/30">
                  {data.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </BHDashboardShell>

      {/* Modals — outside the shell so they overlay the whole viewport */}
      {drillCell && data ? (
        <CellDrillThroughModal
          cell={drillCell}
          listing={data.listings.find(l => l.id === drillCell.listing_id) || null}
          onClose={() => setDrill(null)}
        />
      ) : null}

      {compare && data ? (
        <ChannelCompareModal
          listingId={compare}
          listing={data.listings.find(l => l.id === compare) || null}
          dateIso={config.startDate}
          onClose={() => setCompare(null)}
        />
      ) : null}

      {showVendorExport ? (
        <VendorExportDialog
          config={config}
          onClose={() => setShowVendorExport(false)}
        />
      ) : null}

      {showTaxTester && data ? (
        <TaxStackTester
          listings={data.listings}
          onClose={() => setShowTaxTester(false)}
        />
      ) : null}
    </>
  );
}
