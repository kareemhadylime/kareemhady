// src/app/beithady/analytics/pace/_components/pace-shell.tsx
'use client';
import type { PaceReportPayload } from '@/lib/pace-report/types';
import type { PaceUrlState } from '../_hooks/use-pace-url-state';

type Props = {
  payload: PaceReportPayload;
  initialState: PaceUrlState;
};

// Stub — Tasks 9-12 fill in the real shell + panels.
export function PaceShell({ payload }: Props) {
  return (
    <div
      data-testid="pace-shell-stub"
      className="overflow-hidden rounded-xl border border-[#003462]/10 text-[#003462]"
      style={{
        backgroundColor: '#eae9f3',
        backgroundImage: "url('/brand/beithady/pattern-bg.png')",
        backgroundSize: '280px auto',
        backgroundRepeat: 'repeat',
        backgroundBlendMode: 'soft-light',
      }}
    >
      <div className="p-6">
        <h1 className="text-2xl font-semibold" style={{ fontFamily: 'var(--bh-heading)' }}>
          Pace Report — {payload.date_range.label}
        </h1>
        <p className="mt-2 text-sm text-[#6077a6]">
          {payload.unit_count_in_scope} units · {payload.kpis[0].current_value.toFixed(0)} USD revenue
        </p>
      </div>
    </div>
  );
}
