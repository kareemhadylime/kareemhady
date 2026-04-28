'use client';

import { useState, useTransition, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Send, CheckCircle2, FileCheck2, XCircle, AlertCircle } from 'lucide-react';
import type { CountSessionDetail } from '@/lib/beithady/inventory/counts';
import {
  saveCountedQtyAction,
  submitCountForApprovalAction,
  approveCountAction,
  postCountAction,
  cancelCountAction,
} from '../actions';

type LineDraft = {
  line_id: string;
  counted_qty: number | null;
  note: string | null;
};

export function CountEntryPanel({
  session, editable, canApprove, canWrite,
}: {
  session: CountSessionDetail;
  editable: boolean;
  canApprove: boolean;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [cleanerName, setCleanerName] = useState(session.cleaner_session_name || '');

  const [drafts, setDrafts] = useState<LineDraft[]>(
    session.lines.map(l => ({
      line_id: l.id,
      counted_qty: l.counted_qty,
      note: l.note,
    })),
  );

  const counted = drafts.filter(d => d.counted_qty != null).length;
  const totalLines = drafts.length;
  const progressPct = totalLines > 0 ? Math.round((counted / totalLines) * 100) : 0;

  // Live variance preview
  const livePreview = useMemo(() => {
    let absVarTotal = 0;
    let totalExpected = 0;
    for (const l of session.lines) {
      const draft = drafts.find(d => d.line_id === l.id);
      if (draft?.counted_qty != null) {
        absVarTotal += Math.abs(draft.counted_qty - Number(l.expected_qty));
      }
      totalExpected += Number(l.expected_qty);
    }
    const pct = totalExpected > 0 ? (absVarTotal / totalExpected) * 100 : 0;
    return { absVarTotal, pct };
  }, [drafts, session.lines]);

  function updateDraft(lineId: string, patch: Partial<LineDraft>) {
    setDrafts(d => d.map(x => x.line_id === lineId ? { ...x, ...patch } : x));
  }

  function run<T>(fn: () => Promise<{ ok: boolean; error?: string } | T>) {
    setError(null);
    startTransition(async () => {
      const res = (await fn()) as { ok: boolean; error?: string };
      if (res.ok) router.refresh();
      else setError(res.error || 'Action failed');
    });
  }

  return (
    <>
      {editable && (
        <section className="ix-card p-3 flex items-center gap-3 flex-wrap text-xs">
          <label className="block flex-1 max-w-xs">
            <span className="block text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-0.5">Cleaner / counter name</span>
            <input
              type="text"
              value={cleanerName}
              onChange={e => setCleanerName(e.target.value)}
              placeholder="Aya · 6 May" className="ix-input w-full"
            />
          </label>
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Progress</div>
            <div className="w-full bg-slate-100 rounded-full h-2 mt-1 overflow-hidden">
              <div className="h-full bg-emerald-500 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">{counted} / {totalLines} counted ({progressPct}%)</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">Live variance</div>
            <div className={`text-sm font-bold tabular-nums ${livePreview.pct > 10 ? 'text-rose-700' : livePreview.pct > 0 ? 'text-amber-700' : 'text-slate-500'}`}>
              {livePreview.pct.toFixed(1)}%
            </div>
            <div className="text-[10px] text-slate-400">{livePreview.absVarTotal.toFixed(0)} units off</div>
          </div>
        </section>
      )}

      <section className="ix-card overflow-hidden">
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
          <h3 className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
            Lines ({session.lines.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-3 py-1.5">Item</th>
                <th className="text-left px-3 py-1.5">Batch</th>
                <th className="text-right px-3 py-1.5">Expected</th>
                <th className="text-right px-3 py-1.5 w-28">Counted *</th>
                <th className="text-right px-3 py-1.5">Variance</th>
                <th className="text-left px-3 py-1.5">Note</th>
              </tr>
            </thead>
            <tbody>
              {session.lines.map(l => {
                const draft = drafts.find(d => d.line_id === l.id)!;
                const variance = draft.counted_qty != null ? Number(draft.counted_qty) - Number(l.expected_qty) : null;
                return (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="px-3 py-1.5">
                      <div className="font-mono text-[11px]">{l.item_sku}</div>
                      <div className="text-[10px] text-slate-500">{l.item_name_en}</div>
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[10px] text-slate-500">
                      {l.batch_no === '__bulk__' ? '—' : l.batch_no}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">
                      {l.expected_qty} {l.item_uom}
                    </td>
                    <td className="px-3 py-1.5">
                      {editable ? (
                        <input type="number" min="0" step="0.01"
                          value={draft.counted_qty ?? ''}
                          onChange={e => updateDraft(l.id, { counted_qty: e.target.value === '' ? null : parseFloat(e.target.value) })}
                          className="ix-input w-full text-right" />
                      ) : (
                        <div className="text-right tabular-nums">{l.counted_qty ?? '—'}</div>
                      )}
                    </td>
                    <td className={`px-3 py-1.5 text-right tabular-nums font-medium ${variance == null ? 'text-slate-300' : variance === 0 ? 'text-emerald-700' : variance > 0 ? 'text-amber-700' : 'text-rose-700'}`}>
                      {variance == null ? '—' : (variance > 0 ? '+' : '') + variance.toLocaleString('en-US', { maximumFractionDigits: 1 })}
                    </td>
                    <td className="px-3 py-1.5">
                      {editable ? (
                        <input type="text" value={draft.note || ''}
                          onChange={e => updateDraft(l.id, { note: e.target.value || null })}
                          placeholder="(reason for variance)" className="ix-input w-full text-[10px]" />
                      ) : (
                        <span className="text-[10px] text-slate-500 italic">{l.note || '—'}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Workflow actions */}
      {canWrite && (
        <section className="ix-card p-4 flex items-center gap-2 flex-wrap text-xs">
          {editable && (
            <button type="button" disabled={pending}
              onClick={() => run(() => saveCountedQtyAction({
                session_id: session.id,
                cleaner_session_name: cleanerName || null,
                lines: drafts.map(d => ({ line_id: d.line_id, counted_qty: d.counted_qty, note: d.note })),
              }))}
              className="px-3 py-1.5 font-medium bg-cyan-600 text-white rounded hover:bg-cyan-700 inline-flex items-center gap-1.5 disabled:opacity-50">
              <Save size={12} /> {pending ? '…' : 'Save progress'}
            </button>
          )}

          {(session.status === 'open' || session.status === 'in_progress') && counted === totalLines && (
            <button type="button" disabled={pending}
              onClick={() => {
                if (!confirm('Submit count for approval? Variance >10% requires warehouse_manager.')) return;
                run(() => submitCountForApprovalAction(session.id));
              }}
              className="px-3 py-1.5 font-medium bg-amber-600 text-white rounded hover:bg-amber-700 inline-flex items-center gap-1.5 disabled:opacity-50">
              <Send size={12} /> {pending ? '…' : 'Submit for approval'}
            </button>
          )}

          {session.status === 'pending_approval' && canApprove && (
            <button type="button" disabled={pending}
              onClick={() => run(() => approveCountAction(session.id))}
              className="px-3 py-1.5 font-medium bg-violet-600 text-white rounded hover:bg-violet-700 inline-flex items-center gap-1.5 disabled:opacity-50">
              <CheckCircle2 size={12} /> {pending ? '…' : 'Approve'}
            </button>
          )}

          {session.approved_at && session.status !== 'posted' && (
            <button type="button" disabled={pending}
              onClick={() => {
                if (!confirm('Post this count? Stock balances will adjust to counted_qty and variance will write count_adjust transactions to the ledger. IRREVERSIBLE.')) return;
                run(() => postCountAction(session.id));
              }}
              className="px-3 py-1.5 font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 inline-flex items-center gap-1.5 disabled:opacity-50">
              <FileCheck2 size={12} /> {pending ? 'Posting…' : 'Post adjustments'}
            </button>
          )}

          {(session.status === 'open' || session.status === 'in_progress' || session.status === 'pending_approval') && (
            <button type="button" disabled={pending}
              onClick={() => {
                const reason = window.prompt('Cancellation reason:');
                if (!reason || reason.length < 3) return;
                run(() => cancelCountAction(session.id, reason));
              }}
              className="px-3 py-1.5 font-medium bg-rose-50 text-rose-700 border border-rose-200 rounded hover:bg-rose-100 inline-flex items-center gap-1.5 disabled:opacity-50 ml-auto">
              <XCircle size={12} /> Cancel
            </button>
          )}

          {session.status === 'posted' && (
            <span className="text-[11px] text-emerald-700 inline-flex items-center gap-1.5">
              <CheckCircle2 size={12} /> Posted to ledger.
            </span>
          )}
        </section>
      )}

      {error && (
        <div className="ix-card border-rose-200 bg-rose-50 p-3 text-rose-700 inline-flex items-center gap-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}
    </>
  );
}
