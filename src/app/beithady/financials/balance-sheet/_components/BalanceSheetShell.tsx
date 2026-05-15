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
import { useBSUrlState, type FinBSUrlState } from '../../_hooks/use-bs-url-state';
import { BalanceSheetSection } from '../../_components/BalanceSheetSection';
import type { BalanceSheetReport } from '@/lib/financials-pnl';

type Props = {
  bs: BalanceSheetReport;
  scopeLbl: string;
  asOf: string;
};

const SCOPES: Array<{ id: FinBSUrlState['scope']; label: string }> = [
  { id: 'consolidated', label: 'Consolidated' },
  { id: 'egypt', label: 'Egypt' },
  { id: 'dubai', label: 'Dubai' },
];

const BUILDINGS: Array<{ id: FinBSUrlState['building']; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'BH-26', label: 'BH-26' },
  { id: 'BH-73', label: 'BH-73' },
  { id: 'BH-435', label: 'BH-435' },
  { id: 'BH-OK', label: 'BH-OK' },
  { id: 'OTHER', label: 'Other' },
];

export function BalanceSheetShell({ bs, scopeLbl, asOf }: Props) {
  const { state, update } = useBSUrlState();
  const rail = useRailCollapse();
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

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
          className="rounded-md border px-2.5 py-1.5 text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
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
          title={`Balance Sheet · ${scopeLbl}`}
          subtitle={`As of ${asOf}`}
          chips={[
            { icon: Calendar, label: asOf },
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
            { emoji: '📅', title: `As of: ${state.asof}` },
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
        <BalanceSheetSection bs={bs} />
      </div>
    </BHDashboardShell>
  );
}
