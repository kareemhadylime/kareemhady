import { Archive, Undo2 } from 'lucide-react';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import { restoreConversationAction } from '../archive-actions';
import type { ThreadHeader } from '@/lib/beithady/communication/inbox';

// Phase R.2 — Banner shown inside <ThreadPane> when the conversation
// is archived. Replaces the composer with a "Restore to active inbox"
// CTA per workflow R4. New inbound also auto-restores via webhook
// ingest, so this CTA covers the manual case (agent wants to send a
// proactive ping that re-engages the guest).

const REASON_LABELS: Record<string, string> = {
  manual_month_bulk: 'archived by month bulk action',
  auto_cron_90d: 'archived by 90-day inactivity rule',
  manual_single: 'manually archived',
  duplicate: 'archived as duplicate',
  restore_undo: 'restored',
};

export function ArchivedBanner({
  header,
  returnTo,
}: {
  header: ThreadHeader;
  returnTo: string;
}) {
  const reasonLabel = (header.archived_reason && REASON_LABELS[header.archived_reason])
    || 'archived';
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 p-3 flex items-center gap-3">
      <Archive size={14} className="text-amber-600 dark:text-amber-400 shrink-0" />
      <div className="flex-1 text-xs">
        <div className="font-semibold text-amber-800 dark:text-amber-200">
          This conversation is archived.
        </div>
        <div className="text-amber-700 dark:text-amber-300 mt-0.5">
          {reasonLabel}
          {header.archived_at && ` · ${fmtCairoDateTime(header.archived_at)}`}
          . Restore to send a reply, or wait — any new inbound message will auto-restore.
        </div>
      </div>
      <form action={restoreConversationAction}>
        <input type="hidden" name="conversation_id" value={header.id} />
        <input type="hidden" name="return_to" value={returnTo} />
        <button type="submit" className="ix-btn-primary text-xs whitespace-nowrap">
          <Undo2 size={12} /> Restore
        </button>
      </form>
    </div>
  );
}
