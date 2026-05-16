'use client';
import type { PaceReportPayload } from '@/lib/pace-report/types';
import type { PaceUrlState } from '../_hooks/use-pace-url-state';
import { PaceKpiStrip } from './panels/pace-kpi-strip';

type Props = {
  payload: PaceReportPayload;
  initialState: PaceUrlState;
};

export function PaceShell({ payload }: Props) {
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
      <header className="flex items-center justify-between px-5 py-4 border-b border-[#003462]/10">
        <div>
          <h1 className="text-xl font-semibold" style={{ fontFamily: 'var(--bh-heading)' }}>
            Pace Report
          </h1>
          <p className="text-xs text-[#6077a6] mt-0.5">
            {payload.date_range.label} · {payload.unit_count_in_scope} units in scope
          </p>
        </div>
      </header>
      <main className="grid grid-cols-12 gap-3 p-4 sm:p-5">
        <PaceKpiStrip
          kpis={payload.kpis}
          range={payload.date_range}
          priorRange={payload.prior_date_range}
        />
      </main>
    </div>
  );
}
