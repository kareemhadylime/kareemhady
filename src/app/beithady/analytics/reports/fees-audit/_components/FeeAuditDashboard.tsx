'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import type {
  FeeAuditConfig,
  FeeAuditData,
  FeeCategory,
  BuildingCode,
} from '@/lib/beithady/fees-audit/types';
import type { ChannelBucket } from '@/lib/beithady/guesty-metrics';
import { Sidebar } from './Sidebar';
import { FilterBar } from './FilterBar';
import { KpiStrip } from './KpiStrip';
import { Heatmap } from './Heatmap';
import { CrossRefTable } from './CrossRefTable';
import { AnomalyInspector } from './AnomalyInspector';
import { QuoteCalculator } from './QuoteCalculator';
import { TaxStackTester } from './TaxStackTester';
import { VendorExportDialog } from './VendorExportDialog';
import { CellDrillThroughModal } from './CellDrillThroughModal';
import { ChannelCompareModal } from './ChannelCompareModal';

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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-4">
      <Sidebar
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(o => !o)}
        selected={config.selectedFeeCategory}
        onSelect={(cat) => setConfig({ ...config, selectedFeeCategory: cat })}
      />

      <div className="space-y-4">
        <FilterBar
          config={config}
          onChange={setConfig}
          onOpenVendorExport={() => setShowVendorExport(true)}
          onOpenTaxTester={() => setShowTaxTester(true)}
          loading={loading}
        />

        {error ? (
          <div className="ix-card p-4 bg-rose-50 text-rose-800 text-sm">
            Error: {error}
          </div>
        ) : null}

        {!data && loading ? (
          <div className="ix-card p-12 text-center text-slate-500">
            <Loader2 className="inline animate-spin" size={20} />
            <span className="ml-2">Building fee audit…</span>
          </div>
        ) : null}

        {data ? (
          <>
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
              onCompareChannels={(listingId) => setCompare(listingId)}
            />

            <AnomalyInspector anomalies={data.anomalies} />

            {data.warnings?.length ? (
              <div className="ix-card p-3 text-xs text-amber-800 bg-amber-50">
                {data.warnings.map((w, i) => <div key={i}>⚠ {w}</div>)}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

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
    </div>
  );
}
