'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Snowflake, Download } from 'lucide-react';
import {
  BHDashboardShell,
  BHTitleBar,
  BHLeftRail,
  BHMobileFilterSheet,
  useRailCollapse,
  type BHRailSection,
} from '@/app/beithady/_components/dashboard-shell';
import { useReconciliationUrlState } from '../../_hooks/use-reconciliation-url-state';
import type { ReconciliationReport } from '@/lib/beithady/financials/reconciliation';

type SnapshotOption = { id: string; label: string };

type Props = {
  report: ReconciliationReport;
  snapshotId: string;
  snapshotOptions: SnapshotOption[];
};

export function ReconciliationShell({ report, snapshotId, snapshotOptions }: Props) {
  const { state, update } = useReconciliationUrlState();
  const rail = useRailCollapse();
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const currentLabel = snapshotOptions.find((o) => o.id === snapshotId)?.label ?? snapshotId;

  const railSections: BHRailSection[] = [
    {
      title: 'Snapshot',
      children: (
        <select
          value={state.snapshot_id ?? snapshotId}
          onChange={(e) => update({ snapshot_id: e.target.value })}
          className="rounded-md border px-2.5 py-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 motion-reduce:transition-none"
          style={{
            background: 'transparent',
            color: 'var(--bh-ink)',
            borderColor: 'var(--bh-mute)',
            fontFamily: 'inherit',
          }}
          aria-label="Snapshot"
        >
          {snapshotOptions.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      ),
    },
  ];

  const titleBarActions = (
    <>
      <a
        href={`/api/beithady/financials/reconciliation/xlsx?snapshot=${snapshotId}`}
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{ background: 'transparent', color: 'var(--bh-gold)', borderColor: 'var(--bh-gold)' }}
      >
        <Download className="h-3.5 w-3.5" /> Export xlsx
      </a>
      <Link
        href="/beithady/financials"
        className="rounded-md border px-3 py-1.5 text-xs font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{ background: 'transparent', color: 'var(--bh-gold)', borderColor: 'var(--bh-gold)' }}
      >
        ← Back to Financials
      </Link>
    </>
  );

  return (
    <BHDashboardShell
      railCollapsed={rail.collapsed}
      onRailEnter={rail.handleEnter}
      onRailLeave={rail.handleLeave}
      titleBar={
        <BHTitleBar
          eyebrow="Beit Hady · Financials"
          title="Reconciliation"
          subtitle="Account balance vs. partner ledger totals"
          chips={[{ icon: Snowflake, label: currentLabel }]}
          actions={titleBarActions}
          onMobileFilterClick={() => setMobileFilterOpen(true)}
        />
      }
      rail={
        <BHLeftRail
          sections={railSections}
          collapsed={rail.collapsed}
          collapsedIcons={[{ emoji: '❄️', title: `Snapshot: ${currentLabel}` }]}
          pinned={rail.pinned}
          onTogglePin={rail.togglePinned}
        />
      }
      mobileFilterSheet={
        <BHMobileFilterSheet open={mobileFilterOpen} onClose={() => setMobileFilterOpen(false)}>
          <BHLeftRail sections={railSections} />
        </BHMobileFilterSheet>
      }
    >
      <div className="col-span-12 space-y-4">
        <div className="flex flex-wrap gap-3 text-xs">
          <span className="rounded px-2 py-1" style={{ background: 'var(--bh-cream)', border: '1px solid var(--bh-mute)' }}>
            With partners: <strong>{report.summary.accounts_with_partners}</strong>
          </span>
          <span className="rounded px-2 py-1" style={{ background: 'var(--bh-cream)', border: '1px solid var(--bh-mute)' }}>
            Awaiting ledger: <strong>{report.summary.accounts_awaiting_ledger}</strong>
          </span>
          <span
            className="rounded px-2 py-1"
            style={{
              background: report.summary.open_variance_count ? '#fdecec' : '#dcfce7',
              color: report.summary.open_variance_count ? '#9a2828' : '#166534',
              border: `1px solid ${report.summary.open_variance_count ? '#f1bcbc' : '#bbf7d0'}`,
            }}
          >
            Open variances: <strong>{report.summary.open_variance_count}</strong>
          </span>
          <span className="rounded px-2 py-1" style={{ background: 'var(--bh-cream)', border: '1px solid var(--bh-mute)' }}>
            Total variance: <strong>{Math.round(report.summary.total_variance).toLocaleString('en-US')} EGP</strong>
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b font-semibold" style={{ color: 'var(--bh-ink)' }}>
                <td className="py-1 pr-3">Code</td>
                <td className="pr-3">Account</td>
                <td className="text-right pr-3">Account total</td>
                <td className="text-right pr-3">Partner total</td>
                <td className="text-right pr-3">Variance</td>
                <td>Status</td>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r, i) => (
                <tr
                  key={i}
                  className="border-b"
                  style={{
                    background: r.variance !== 0 && r.variance_status === 'open' ? '#fdecec' : undefined,
                  }}
                >
                  <td className="py-1 pr-3">{r.account_code}</td>
                  <td className="pr-3">{r.account_name}</td>
                  <td className="text-right pr-3">
                    {Math.round(r.opening_raw).toLocaleString('en-US')}
                  </td>
                  <td className="text-right pr-3">
                    {r.partner_total == null
                      ? '—'
                      : Math.round(r.partner_total).toLocaleString('en-US')}
                  </td>
                  <td
                    className="text-right pr-3"
                    style={{
                      color: r.variance !== 0 ? '#9a2828' : undefined,
                      fontWeight: r.variance !== 0 ? 600 : undefined,
                    }}
                  >
                    {r.variance === 0 ? '0' : Math.round(r.variance).toLocaleString('en-US')}
                  </td>
                  <td>
                    {r.partner_total == null
                      ? '⏳ Awaiting'
                      : r.variance === 0
                        ? '✓ Clean'
                        : `🔴 ${r.variance_status}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </BHDashboardShell>
  );
}
