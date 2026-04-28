'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send, Zap } from 'lucide-react';
import { ConfirmWriteModal } from './confirm-write-modal';
import { bulkSendPreArrivalAction } from '../actions';

export function BulkActions({ buildings }: { buildings?: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [daysAhead, setDaysAhead] = useState('3');
  const [matched, setMatched] = useState<number | null>(null);

  const dryRun = () => {
    startTransition(async () => {
      const r = await bulkSendPreArrivalAction({
        daysAhead: Number(daysAhead),
        buildingCodes: buildings,
        dryRun: true,
      });
      if (r.ok) {
        setMatched(r.matched);
      } else {
        alert(`Failed: ${r.error}`);
      }
    });
  };

  const submit = () => {
    startTransition(async () => {
      const r = await bulkSendPreArrivalAction({
        daysAhead: Number(daysAhead),
        buildingCodes: buildings,
      });
      if (r.ok) {
        setOpen(false);
        setMatched(null);
        alert(`Queued ${r.matched} pre-arrival message${r.matched === 1 ? '' : 's'}${r.skipped > 0 ? ` (${r.skipped} skipped)` : ''}. Cron will deliver within 5 min.`);
        router.refresh();
      } else {
        alert(`Failed: ${r.error}`);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { setOpen(true); setMatched(null); }}
        className="ix-btn-secondary !text-xs"
        title="Send pre-arrival messages in bulk"
      >
        <Zap size={12} /> Bulk
      </button>
      {open && (
        <ConfirmWriteModal
          title="Bulk send pre-arrival messages"
          description="Queues pre-arrival messages for every confirmed reservation arriving in the next N days that hasn't received one yet. The pre-arrival cron picks up the queue every 5 minutes."
          warningType="local_only"
          pending={pending}
          onConfirm={submit}
          onCancel={() => { setOpen(false); setMatched(null); }}
        >
          <div className="space-y-2">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wide text-slate-500">Look-ahead (days)</span>
              <input
                type="number"
                min={1}
                max={14}
                value={daysAhead}
                onChange={e => setDaysAhead(e.target.value)}
                className="ix-input !text-xs !py-1 !px-2 w-full mt-0.5"
              />
            </label>
            <button
              type="button"
              onClick={dryRun}
              disabled={pending}
              className="ix-btn-secondary !text-xs w-full"
            >
              <Send size={11} /> Preview match count
            </button>
            {matched != null && (
              <div className="text-[11px] p-2 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-900 dark:text-cyan-200 rounded">
                <span className="font-semibold">{matched}</span> reservation{matched === 1 ? '' : 's'} would be queued
                {buildings && buildings.length > 0 && (
                  <> in {buildings.join(', ')}</>
                )}.
              </div>
            )}
          </div>
        </ConfirmWriteModal>
      )}
    </>
  );
}
