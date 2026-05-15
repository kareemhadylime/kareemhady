'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Calendar } from 'lucide-react';
import {
  BHDashboardShell,
  BHTitleBar,
  BHLeftRail,
  BHRailPill,
  BHMobileFilterSheet,
  useRailCollapse,
  type BHRailSection,
} from '@/app/beithady/_components/dashboard-shell';
import { usePayablesUrlState, type FinPayablesUrlState } from '../../_hooks/use-payables-url-state';
import { PayablesBlock } from '../../_components/PayablesBlock';
import type { CompanyScope } from '@/lib/financials-pnl';

type Props = {
  payables: Parameters<typeof PayablesBlock>[0]['payables'];
  scope: CompanyScope;
  asOf: string;
  scopeLbl: string;
};

const SCOPES: Array<{ id: FinPayablesUrlState['scope']; label: string }> = [
  { id: 'consolidated', label: 'Consolidated' },
  { id: 'egypt', label: 'Egypt' },
  { id: 'dubai', label: 'Dubai' },
];

export function PayablesShell({ payables, scope, asOf, scopeLbl }: Props) {
  const { state, update } = usePayablesUrlState();
  const rail = useRailCollapse();
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

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
          title={`Payables · ${scopeLbl}`}
          subtitle={`As of ${asOf}`}
          chips={[{ icon: Calendar, label: asOf }]}
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
        <PayablesBlock
          payables={payables}
          scope={scope}
          asOf={asOf}
          scopeLbl={scopeLbl}
        />
      </div>
    </BHDashboardShell>
  );
}
