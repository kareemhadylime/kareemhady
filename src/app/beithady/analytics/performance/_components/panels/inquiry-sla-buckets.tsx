'use client';
import { PanelFrame } from '../panel-frame';
import type { DailyReportPayload } from '@/lib/beithady-daily-report/types';

type Props = { payload: DailyReportPayload; onHide?: () => void };

const BUCKET_COLOR: Record<'<1h' | '1-4h' | '4-24h' | '>24h', string> = {
  '<1h': '#16a34a',
  '1-4h': '#6077a6',
  '4-24h': '#d97706',
  '>24h': '#dc2626',
};
const BUCKET_ORDER: Array<'<1h' | '1-4h' | '4-24h' | '>24h'> = ['<1h', '1-4h', '4-24h', '>24h'];

export function InquirySlaBuckets({ payload, onHide }: Props) {
  const conv = payload.conversations;
  const buckets = conv?.sla_buckets_yesterday ?? [];
  const total = buckets.reduce((sum, b) => sum + b.count, 0) || 1;
  const unanswered = payload.inquiry_triage?.inquiries_unanswered_count ?? 0;

  return (
    <PanelFrame
      label={`📥 Inquiry SLA · ${unanswered} unanswered`}
      onHide={onHide}
      drillTo="/beithady/communication/unified"
    >
      <div className="flex h-4 overflow-hidden rounded text-[8px] font-bold text-white" role="img" aria-label={`Response time buckets: ${buckets.map((b) => `${b.count} ${b.bucket}`).join(', ')}`}>
        {BUCKET_ORDER.map((tier) => {
          const entry = buckets.find((b) => b.bucket === tier);
          const count = entry?.count ?? 0;
          const widthPct = (count / total) * 100;
          if (widthPct === 0) return null;
          return (
            <div
              key={tier}
              className="flex items-center justify-center"
              style={{ width: `${widthPct}%`, background: BUCKET_COLOR[tier], minWidth: widthPct < 8 ? 0 : undefined }}
              title={`${count} ${tier}`}
            >
              {widthPct >= 8 ? `${count} ${tier}` : ''}
            </div>
          );
        })}
        {buckets.length === 0 && <div className="flex w-full items-center justify-center text-[#6077a6]">No data</div>}
      </div>
      {conv && (
        <div className="mt-2 text-[10px] text-[#6077a6]">
          MTD avg {conv.mtd.avg_response_minutes.toFixed(0)}m · first {conv.mtd.first_response_avg_minutes.toFixed(0)}m
          {conv.worst_2_agents.length > 0 && (
            <span className="text-red-600">
              {' '}· Worst-{conv.worst_2_agents.length}: {conv.worst_2_agents.map((a) => `${a.agent_name} ${a.avg_response_minutes.toFixed(0)}m`).join(' · ')}
            </span>
          )}
        </div>
      )}
    </PanelFrame>
  );
}
