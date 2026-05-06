'use client';
import { useState } from 'react';
import { TopBar } from './top-bar';
import { LeftRail } from './left-rail';
import { usePerfUrlState } from '../_hooks/use-url-state';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';
import type { CompareMode } from '../_hooks/use-url-state';

type Props = {
  payload: DailyReportPayload;
  snapshotDate: string;
  generatedAt: string;
  initialBuilding: string;
  initialCompare: CompareMode;
};

export function DashboardShell({
  payload,
  snapshotDate,
  generatedAt,
  initialBuilding: _initialBuilding,
  initialCompare: _initialCompare,
}: Props) {
  const { state, update } = usePerfUrlState();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div
      className="overflow-hidden rounded-xl border border-[#003462]/10 text-[#003462]"
      style={{
        backgroundColor: '#eae9f3',
        backgroundImage: "url('/brand/beithady/pattern-bg.png')",
        backgroundSize: '280px auto',
        backgroundRepeat: 'repeat',
        backgroundBlendMode: 'soft-light',
      }}
    >
      <TopBar
        state={state}
        generatedAt={generatedAt}
        reportDate={snapshotDate}
        hiddenCount={0}
        onCustomizeClick={() => setDrawerOpen(true)}
        onDateChange={(date) => update({ date })}
      />
      <div className="grid" style={{ gridTemplateColumns: '200px 1fr' }}>
        <LeftRail state={state} onChange={update} />
        <main className="grid grid-cols-12 gap-3 p-4 sm:p-5">
          {/* Phase 2 fills this in */}
          <div className="col-span-12 rounded-lg border border-dashed border-[#003462]/15 bg-white/50 p-12 text-center text-sm text-[#6077a6]">
            Panels arrive in Phase 2 · payload loaded for {payload.report_date}
          </div>
        </main>
      </div>
      {drawerOpen && (
        <div
          className="fixed inset-0 z-50 bg-[#003462]/40"
          onClick={() => setDrawerOpen(false)}
          role="presentation"
        >
          <div
            className="absolute right-0 top-0 h-full w-96 bg-white p-6"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Customize dashboard"
            aria-modal="true"
          >
            <p className="text-sm text-[#6077a6]">Customize drawer arrives in Phase 6.</p>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
              className="mt-3 rounded-md border border-[#003462] bg-[#003462] px-3 py-1.5 text-xs text-white hover:bg-[#003462]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-2"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
