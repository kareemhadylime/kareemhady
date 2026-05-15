'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Calendar, Building2 } from 'lucide-react';
import {
  BHDashboardShell,
  BHTitleBar,
  BHLeftRail,
  BHRailPill,
  BHMobileFilterSheet,
  useRailCollapse,
  type BHRailSection,
} from '@/app/beithady/_components/dashboard-shell';
import { usePerfPnlUrlState, type FinPerfUrlState } from '../../_hooks/use-perf-pnl-url-state';
import { PnlSection, UnclassifiedPanel } from '../../_components/PnlSection';
import type { PnlReport } from '@/lib/financials-pnl';

type Props = {
  pnl: PnlReport;
  scopeLbl: string;
  buildingCode: string | undefined;
  lobLabel: string | undefined;
  periodLabel: string;
};

const SCOPES: Array<{ id: FinPerfUrlState['scope']; label: string }> = [
  { id: 'consolidated', label: 'Consolidated' },
  { id: 'egypt', label: 'Egypt' },
  { id: 'dubai', label: 'Dubai' },
  // A1 intentionally omitted from UI per P0-1 (URL backward-compat preserved in the type guard)
];

const PRESETS: Array<{ id: 'this_month' | 'last_month' | 'this_quarter' | 'last_quarter' | 'this_year' | 'last_year'; label: string }> = [
  { id: 'this_month', label: 'This month' },
  { id: 'last_month', label: 'Last month' },
  { id: 'this_quarter', label: 'This quarter' },
  { id: 'last_quarter', label: 'Last quarter' },
  { id: 'this_year', label: 'This year' },
  { id: 'last_year', label: 'Last year' },
];

const BUILDINGS: Array<{ id: FinPerfUrlState['building']; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'BH-26', label: 'BH-26' },
  { id: 'BH-73', label: 'BH-73' },
  { id: 'BH-435', label: 'BH-435' },
  { id: 'BH-OK', label: 'BH-OK' },
  { id: 'OTHER', label: 'Other' },
];

export function PerformanceShell({ pnl, scopeLbl, buildingCode, lobLabel, periodLabel }: Props) {
  const { state, update } = usePerfPnlUrlState();
  const rail = useRailCollapse();
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Local destructure so TS narrows on `period.kind` reliably (chained
  // `state.period.kind` reads lose the narrowing on each property access).
  const period = state.period;
  const monthValue = period.kind === 'month' ? period.ym : '';
  const periodChipLabel = period.kind === 'month'
    ? `Month: ${period.ym}`
    : `Period: ${PRESETS.find((p) => p.id === period.id)?.label ?? period.id}`;
  const buildingChipLabel = state.building === 'all' ? 'All buildings' : state.building;

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
      title: 'Period',
      children: (
        <>
          {PRESETS.map((p) => (
            <BHRailPill
              key={p.id}
              active={state.period.kind === 'preset' && state.period.id === p.id}
              onClick={() => update({ period: { kind: 'preset', id: p.id } })}
            >
              {p.label}
            </BHRailPill>
          ))}
          <input
            type="month"
            value={monthValue}
            onChange={(e) => {
              if (e.target.value) {
                update({ period: { kind: 'month', ym: e.target.value } });
              }
            }}
            className="rounded-md border px-2.5 py-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 motion-reduce:transition-none"
            style={{
              background: 'transparent',
              color: 'var(--bh-ink)',
              borderColor: 'var(--bh-mute)',
              fontFamily: 'inherit',
            }}
            aria-label="Pick month"
          />
        </>
      ),
    },
    {
      title: 'Building',
      children: (
        <>
          {BUILDINGS.map((b) => (
            <BHRailPill
              key={b.id}
              active={state.building === b.id}
              onClick={() => update({ building: b.id })}
            >
              {b.label}
            </BHRailPill>
          ))}
        </>
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
          title={`Performance · ${scopeLbl}`}
          subtitle={periodLabel}
          chips={[
            { icon: Calendar, label: periodChipLabel },
            { icon: Building2, label: buildingChipLabel },
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
            { emoji: '📅', title: periodChipLabel },
            { emoji: '🏢', title: `Building: ${state.building}` },
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
      <div className="col-span-12">
        <PnlSection
          pnl={pnl}
          scopeLbl={scopeLbl}
          buildingCode={buildingCode}
          lobLabel={lobLabel}
        />
        {pnl.unclassified.length > 0 && <UnclassifiedPanel pnl={pnl} />}
      </div>
    </BHDashboardShell>
  );
}
