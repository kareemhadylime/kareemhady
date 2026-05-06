'use client';
import { useEffect, useState, useTransition } from 'react';
import { PanelFrame } from '../panel-frame';
import { useRouter, useSearchParams } from 'next/navigation';

type Props = {
  /** The currently-displayed snapshot date (YYYY-MM-DD). */
  currentDate: string;
  /** Earliest available snapshot date — fetched from server. */
  earliestDate: string | null;
  onHide?: () => void;
};

const MS_PER_DAY = 86400000;

function ymdToTs(ymd: string): number {
  return new Date(ymd + 'T00:00:00Z').getTime();
}

function tsToYmd(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function SnapshotScrubber({ currentDate, earliestDate, onHide }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const today = tsToYmd(Date.now());
  const earliest = earliestDate ?? today;
  const earliestTs = ymdToTs(earliest);
  const todayTs = ymdToTs(today);
  const totalDays = Math.max(0, Math.floor((todayTs - earliestTs) / MS_PER_DAY));

  const currentTs = ymdToTs(currentDate);
  const initialOffset = Math.max(0, Math.floor((currentTs - earliestTs) / MS_PER_DAY));
  const [offset, setOffset] = useState(initialOffset);

  // Keep slider in sync with external URL changes
  useEffect(() => {
    setOffset(initialOffset);
  }, [initialOffset]);

  const previewDate = tsToYmd(earliestTs + offset * MS_PER_DAY);

  function commit(targetOffset: number) {
    const targetDate = tsToYmd(earliestTs + targetOffset * MS_PER_DAY);
    if (targetDate === currentDate) return;
    const params = new URLSearchParams(searchParams.toString());
    if (targetDate === today) {
      params.delete('date');
    } else {
      params.set('date', targetDate);
    }
    const qs = params.toString();
    startTransition(() => {
      router.push(`/beithady/analytics/performance${qs ? `?${qs}` : ''}`, { scroll: false });
    });
  }

  if (totalDays <= 0 || !earliestDate) {
    return (
      <PanelFrame label="⏪ Snapshot history" onHide={onHide}>
        <p className="text-[10px] text-[#6077a6]">No history available yet — only one snapshot on file.</p>
      </PanelFrame>
    );
  }

  return (
    <PanelFrame label="⏪ Snapshot history · scrub past dates" onHide={onHide}>
      <div className="flex items-center gap-3 text-[10px] text-[#003462]">
        <span className="font-mono whitespace-nowrap">{earliest}</span>
        <input
          type="range"
          min={0}
          max={totalDays}
          step={1}
          value={offset}
          onChange={(e) => setOffset(Number(e.target.value))}
          onMouseUp={() => commit(offset)}
          onTouchEnd={() => commit(offset)}
          onKeyUp={() => commit(offset)}
          aria-label="Scrub past snapshot date"
          aria-valuemin={0}
          aria-valuemax={totalDays}
          aria-valuenow={offset}
          aria-valuetext={previewDate}
          className="flex-1 h-1.5 cursor-pointer appearance-none rounded-full bg-[#eae9f3] accent-[#003462] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#003462]/40 focus-visible:ring-offset-1"
        />
        <span className="font-mono whitespace-nowrap font-semibold">
          {previewDate}
          {isPending && <span className="ml-1 text-[#6077a6]">⏳</span>}
        </span>
      </div>
      <p className="mt-2 text-[9px] text-[#6077a6]">
        Drag, release, or use ←/→ keys to navigate. Snapshots back to {earliest}.
      </p>
    </PanelFrame>
  );
}
