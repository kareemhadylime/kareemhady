'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Send, CheckCircle2, XCircle, FileCheck2, AlertCircle } from 'lucide-react';
import { submitIssueAction, approveIssueAction, rejectIssueAction, postIssueAction } from '../actions';
import type { IssueStatus } from '@/lib/beithady/inventory/issue';

export function IssueTransitionButtons({
  issueId, status, requiredApprovers, canApprove,
}: {
  issueId: string;
  status: IssueStatus;
  requiredApprovers: string[];
  canApprove: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) router.refresh();
      else setError(res.error || 'Action failed');
    });
  }

  return (
    <section className="ix-card p-4 space-y-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">Workflow actions</div>
      <div className="flex items-center gap-2 flex-wrap">
        {(status === 'draft' || status === 'rejected') && (
          <button type="button" onClick={() => run(() => submitIssueAction(issueId), 'Submit this issue?')}
            disabled={pending} className="px-3 py-1.5 text-xs font-medium bg-cyan-600 text-white rounded hover:bg-cyan-700 inline-flex items-center gap-1.5 disabled:opacity-50">
            <Send size={12} /> {pending ? '…' : 'Submit'}
          </button>
        )}
        {status === 'pending_approval' && (
          <>
            {canApprove ? (
              <button type="button" onClick={() => run(() => approveIssueAction(issueId), `Approve as ${requiredApprovers.join('/')}?`)}
                disabled={pending} className="px-3 py-1.5 text-xs font-medium bg-violet-600 text-white rounded hover:bg-violet-700 inline-flex items-center gap-1.5 disabled:opacity-50">
                <CheckCircle2 size={12} /> {pending ? '…' : 'Approve'}
              </button>
            ) : (
              <span className="text-[11px] text-slate-500 italic">
                Awaiting approval from {requiredApprovers.join(' / ')}
              </span>
            )}
            <button type="button" onClick={() => {
              const reason = window.prompt('Rejection reason (will be stored in audit log):');
              if (!reason || reason.length < 5) return;
              run(() => rejectIssueAction(issueId, reason));
            }} disabled={pending} className="px-3 py-1.5 text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200 rounded hover:bg-rose-100 inline-flex items-center gap-1.5 disabled:opacity-50">
              <XCircle size={12} /> Reject
            </button>
          </>
        )}
        {status === 'approved' && (
          <button type="button" onClick={() => run(() => postIssueAction(issueId), 'Post this issue? IRREVERSIBLE — stock will decrement (FIFO batch picking).')}
            disabled={pending} className="px-3 py-1.5 text-xs font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 inline-flex items-center gap-1.5 disabled:opacity-50">
            <FileCheck2 size={12} /> {pending ? 'Posting…' : 'Post to ledger'}
          </button>
        )}
        {status === 'posted' && (
          <span className="text-[11px] text-emerald-700 inline-flex items-center gap-1.5">
            <CheckCircle2 size={12} /> Posted to ledger.
          </span>
        )}
      </div>
      {error && (
        <div className="text-rose-700 bg-rose-50 border border-rose-200 rounded p-2 text-xs inline-flex items-center gap-1.5">
          <AlertCircle size={12} /> {error}
        </div>
      )}
    </section>
  );
}
