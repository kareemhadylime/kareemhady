'use client';
import { useMemo, useState } from 'react';
import { PanelFrame } from '@/app/beithady/analytics/performance/_components/panel-frame';
import { TabStrip } from '../tab-strip';
import { COHORT_LABELS, type CohortBucket, type PaceKpiMetric, type PickupCohortRow } from '@/lib/pace-report/types';

// Brand-locked four-stop ramp from light to deep navy. Matches the
// Guesty stacked-bar visualization while staying on-brand.
const BUCKET_COLOR: Record<CohortBucket, string> = {
  same_month: '#5b8bd6',           // bright navy
  one_month: '#f1a07a',             // warm peach
  two_month: '#e35a78',              // rose
  three_to_five_month: '#9ec5b8',   // sage
  six_plus_month: '#6077a6',         // muted navy
};

const STACK_ORDER: CohortBucket[] = [
  'six_plus_month', 'three_to_five_month', 'two_month', 'one_month', 'same_month',
];

const METRIC_TABS: { value: PaceKpiMetric; label: string }[] = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'booked_days', label: 'Booked Days' },
  { value: 'anr', label: 'ANR' },
];

type Props = { rows: PickupCohortRow[] };

function fmt(v: number, metric: PaceKpiMetric): string {
  if (metric === 'revenue') return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (metric === 'booked_days') return v.toFixed(0);
  return v.toFixed(2);
}

function monthLabel(yyyyMm: string): string {
  const [y, m] = yyyyMm.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function PickupCohort({ rows }: Props) {
  const [metric, setMetric] = useState<PaceKpiMetric>('revenue');

  const { stacks, max } = useMemo(() => {
    const stacks = rows.map((r) => {
      const valueOf = (b: CohortBucket): number => {
        if (metric === 'revenue') return r.buckets[b].revenue_usd;
        if (metric === 'booked_days') return r.buckets[b].booked_days;
        return r.buckets[b].anr_usd;
      };
      const total = STACK_ORDER.reduce((s, b) => s + valueOf(b), 0);
      return { month: r.check_in_month, total, valueOf };
    });
    const max = Math.max(...stacks.map((s) => s.total), 1);
    return { stacks, max };
  }, [rows, metric]);

  return (
    <PanelFrame label="📈 Revenue & Bookings Pickup By Creation Month">
      <div className="mb-3">
        <TabStrip tabs={METRIC_TABS} value={metric} onChange={setMetric} ariaLabel="Pickup metric" />
      </div>

      <Legend />

      <div className="mt-3 flex justify-around items-end gap-6 h-[220px] px-4">
        {stacks.map((stack) => (
          <div key={stack.month} className="flex flex-col items-center gap-1">
            <span
              className="text-[11px] font-semibold text-[#003462] tabular-nums"
              style={{ fontFamily: 'var(--bh-heading)' }}
            >
              {fmt(stack.total, metric)}
            </span>
            <div className="relative w-16 rounded-sm overflow-hidden bg-[#003462]/5" style={{ height: 180 }}>
              {(() => {
                let acc = 0;
                return STACK_ORDER.map((b) => {
                  const v = stack.valueOf(b);
                  const pct = (v / max) * 100;
                  const top = (acc / max) * 100;
                  acc += v;
                  if (v <= 0) return null;
                  return (
                    <div
                      key={b}
                      className="absolute left-0 right-0 transition-[height] duration-300 motion-reduce:transition-none"
                      style={{
                        bottom: `${top}%`,
                        height: `${pct}%`,
                        backgroundColor: BUCKET_COLOR[b],
                      }}
                      title={`${COHORT_LABELS[b]}: ${fmt(v, metric)}`}
                    />
                  );
                });
              })()}
            </div>
            <span className="text-[10px] text-[#6077a6]" style={{ fontFamily: 'var(--bh-heading)' }}>{monthLabel(stack.month)}</span>
          </div>
        ))}
      </div>
    </PanelFrame>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 justify-center text-[10px] text-[#003462]">
      {(['same_month', 'one_month', 'two_month', 'three_to_five_month', 'six_plus_month'] as CohortBucket[]).map((b) => (
        <span key={b} className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: BUCKET_COLOR[b] }} />
          {COHORT_LABELS[b]}
        </span>
      ))}
    </div>
  );
}
