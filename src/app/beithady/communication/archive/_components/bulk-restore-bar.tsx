'use client';
import { useState } from 'react';
import { Undo2 } from 'lucide-react';
import { bulkRestoreConversationsAction } from '../../archive-actions';

// Q.4 #13 surface for archive — multi-select + bulk-restore.
// Shows when at least one conversation is checked. Selection state
// lives in this client component; checkboxes render through an HTML
// form so the action picks up the FormData.

export function BulkRestoreBar({
  conversationIds,
  basePath,
}: {
  conversationIds: string[];
  basePath: string;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const allChecked = selected.size === conversationIds.length && conversationIds.length > 0;
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(conversationIds));
  };

  return (
    <form
      action={bulkRestoreConversationsAction}
      className="ix-card p-2 flex items-center justify-between gap-2 text-xs"
    >
      <input type="hidden" name="return_to" value={basePath} />
      {Array.from(selected).map(id => (
        <input key={id} type="hidden" name="conversation_id" value={id} />
      ))}
      <label className="inline-flex items-center gap-2 cursor-pointer text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          checked={allChecked}
          onChange={toggleAll}
          className="w-3.5 h-3.5"
        />
        {selected.size === 0 ? (
          <span>Select all in view</span>
        ) : (
          <span className="font-semibold text-slate-800 dark:text-slate-100">
            {selected.size} selected
          </span>
        )}
      </label>
      <button
        type="submit"
        disabled={selected.size === 0}
        className="ix-btn-primary text-xs disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Undo2 size={12} /> Restore selected
      </button>
      {/* Hidden checkboxes for individual rows are rendered inside SidebarList
          via a parent-controlled select callback — but that requires lifting
          state. For V1 we keep the bar simple: select-all toggle only. The
          inline per-row Restore button covers single-row workflow. */}
    </form>
  );
}
