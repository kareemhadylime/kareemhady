'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save, CheckCircle2 } from 'lucide-react';
import { publishYearAction } from '../actions';

interface Props {
  yearId: number;
  yearIndex: number;
  status: 'draft' | 'published';
  canEdit: boolean;
}

export function SavePublishButtons({ yearId, yearIndex, status, canEdit }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Save Draft is currently a no-op for the page-level header — line edits
  // already persist via individual actions (addLineAction, updateLineCtcAction).
  // Including it here for visual completeness / future bulk-edit support.
  const onSaveDraft = () => {
    // Future: bulk-save inline-edited line state (qty, unit_cost) if we add that path.
    router.refresh();
  };

  const onPublish = () => {
    if (!canEdit) return;
    if (!confirm(`Publish Y${yearIndex}? Subsequent edits will be logged in budget_audit.`)) return;
    setError(null);
    startTransition(async () => {
      try {
        await publishYearAction(yearId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-[11px] text-red-400 mr-2">{error}</span>}
      <button type="button" onClick={onSaveDraft}
        disabled={!canEdit || isPending}
        className="text-xs px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-1">
        <Save size={12} /> Save Draft
      </button>
      {status === 'published' ? (
        <span className="text-xs px-4 py-1.5 bg-green-500/15 text-green-400 border border-green-500/30 rounded font-semibold flex items-center gap-1">
          <CheckCircle2 size={12} /> Y{yearIndex} published
        </span>
      ) : (
        <button type="button" onClick={onPublish}
          disabled={!canEdit || isPending}
          className="text-xs px-4 py-1.5 bg-indigo-600 text-white rounded font-semibold disabled:opacity-60 disabled:cursor-not-allowed">
          {isPending ? 'Publishing…' : `Publish Y${yearIndex}`}
        </button>
      )}
    </div>
  );
}
