'use client';
import { useState } from 'react';
import { Archive, AlertTriangle } from 'lucide-react';
import { archiveConversationsMonthAction } from '../../archive-actions';

// R.3 — Bulk-archive every active conversation in this month.
// Type-to-confirm gate when count > 500 per workflow R11.

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function ArchiveMonthHeaderActions({
  year,
  month,
  count,
}: {
  year: number;
  month: number;
  count: number;
}) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const monthLabel = `${MONTH_NAMES[month - 1]} ${year}`;
  const requiresType = count > 500;
  const confirmWord = `archive ${monthLabel.toLowerCase()}`;
  const enabled = !requiresType || typed.trim().toLowerCase() === confirmWord;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ix-btn-secondary text-xs"
        title="Bulk-archive every still-active conversation in this month"
      >
        <Archive size={12} /> Bulk-archive {monthLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="ix-card max-w-md w-full p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500" />
              <h3 className="font-semibold">Bulk-archive {monthLabel}?</h3>
            </div>
            <p className="text-xs text-slate-500">
              This archives every still-active conversation whose last activity was in {monthLabel}. The threads remain searchable in the archive view and any new inbound message auto-restores them.
            </p>
            {requiresType && (
              <div className="space-y-1">
                <label className="text-xs text-slate-600 dark:text-slate-300">
                  Type <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{confirmWord}</code> to confirm:
                </label>
                <input
                  type="text"
                  value={typed}
                  onChange={e => setTyped(e.target.value)}
                  className="ix-input w-full text-xs"
                  autoFocus
                />
              </div>
            )}
            <form action={archiveConversationsMonthAction} className="flex justify-end gap-2">
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="month" value={month} />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="ix-btn-secondary text-xs"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!enabled}
                className="ix-btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Archive size={12} /> Archive
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
