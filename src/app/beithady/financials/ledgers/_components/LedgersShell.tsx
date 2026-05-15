'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Calendar, Users } from 'lucide-react';
import {
  BHDashboardShell,
  BHTitleBar,
  BHLeftRail,
  BHRailPill,
  BHMobileFilterSheet,
  useRailCollapse,
  type BHRailSection,
} from '@/app/beithady/_components/dashboard-shell';
import { useLedgersUrlState, type FinLedgersUrlState, type LedgerKind } from '../../_hooks/use-ledgers-url-state';
import { PartnerLedgerTable } from '../../_components/PartnerLedgerTable';
import type { LedgerReport } from '@/lib/beithady/financials/ledgers';

type Props = {
  report: LedgerReport;
  scope: FinLedgersUrlState['scope'];
  kind: LedgerKind;
  asOf: string;
  scopeLbl: string;
};

const SCOPES: Array<{ id: FinLedgersUrlState['scope']; label: string }> = [
  { id: 'consolidated', label: 'Consolidated' },
  { id: 'egypt', label: 'Egypt' },
  { id: 'dubai', label: 'Dubai' },
];

const KINDS: Array<{ id: LedgerKind; label: string }> = [
  { id: 'supplier', label: 'Suppliers' },
  { id: 'owner', label: 'Owners' },
  { id: 'customer', label: 'Customers' },
  { id: 'landlord', label: 'Landlords' },
  { id: 'employee', label: 'Employees' },
  { id: 'noteholder', label: 'Noteholders' },
  { id: 'all', label: 'All' },
];

export function LedgersShell({ report, scope, kind, asOf, scopeLbl }: Props) {
  const { state, update } = useLedgersUrlState();
  const rail = useRailCollapse();
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const kindLabel = KINDS.find((k) => k.id === kind)?.label ?? kind;
  const sum = report.rows.reduce((s, r) => s + r.current_balance, 0);

  const railSections: BHRailSection[] = [
    {
      title: 'Scope',
      children: (
        <>
          {SCOPES.map((s) => (
            <BHRailPill
              key={s.id}
              active={state.scope === s.id}
              onClick={() => update({ scope: s.id })}
            >
              {s.label}
            </BHRailPill>
          ))}
        </>
      ),
    },
    {
      title: 'Kind',
      children: (
        <>
          {KINDS.map((k) => (
            <BHRailPill
              key={k.id}
              active={state.kind === k.id}
              onClick={() => update({ kind: k.id })}
            >
              {k.label}
            </BHRailPill>
          ))}
        </>
      ),
    },
    {
      title: 'As of',
      children: (
        <input
          type="date"
          value={state.asof}
          onChange={(e) => {
            if (e.target.value) {
              update({ asof: e.target.value });
            }
          }}
          className="rounded-md border px-2.5 py-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 motion-reduce:transition-none"
          style={{
            background: 'transparent',
            color: 'var(--bh-ink)',
            borderColor: 'var(--bh-mute)',
            fontFamily: 'inherit',
          }}
          aria-label="As-of date"
        />
      ),
    },
  ];

  const titleBarActions = (
    <Link
      href="/beithady/financials"
      className="rounded-md border px-3 py-1.5 text-xs font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
      style={{ background: 'transparent', color: 'var(--bh-gold)', borderColor: 'var(--bh-gold)' }}
    >
      ← Back to Financials
    </Link>
  );

  return (
    <BHDashboardShell
      railCollapsed={rail.collapsed}
      onRailEnter={rail.handleEnter}
      onRailLeave={rail.handleLeave}
      titleBar={
        <BHTitleBar
          eyebrow="Beit Hady · Financials"
          title={`Partner Ledgers · ${kindLabel}`}
          subtitle={`${scopeLbl} · As of ${asOf}`}
          chips={[
            { icon: Calendar, label: asOf },
            { icon: Users, label: kindLabel },
          ]}
          actions={titleBarActions}
          onMobileFilterClick={() => setMobileFilterOpen(true)}
        />
      }
      rail={
        <BHLeftRail
          sections={railSections}
          collapsed={rail.collapsed}
          collapsedIcons={[
            { emoji: '🎯', title: `Scope: ${state.scope}` },
            { emoji: '👥', title: `Kind: ${state.kind}` },
            { emoji: '📅', title: `As of: ${state.asof}` },
          ]}
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
        <p className="text-xs" style={{ color: 'var(--bh-steel)' }}>
          Opening from snapshot{' '}
          <strong>{report.opening_period_end ?? '—'}</strong> · as of {asOf}
        </p>
        <PartnerLedgerTable rows={report.rows} />
        {report.rows.length > 0 ? (
          <p className="text-xs text-right" style={{ color: 'var(--bh-steel)' }}>
            Sum: <strong>{Math.round(sum).toLocaleString('en-US')} EGP</strong>
          </p>
        ) : null}
      </div>
    </BHDashboardShell>
  );
}
