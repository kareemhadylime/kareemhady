'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, AlertTriangle, Save, Power, ShieldCheck } from 'lucide-react';
import {
  updateUpsellAction,
  approveUpsellAction,
  setUpsellEnabledAction,
} from '../actions';

type Upsell = {
  id: string;
  sku: string;
  name: string;
  description: string;
  price_usd: number | null;
  enabled: boolean;
  approved_at: string | null;
  approved_by_user: string | null;
  approved_name: string | null;
  approved_description: string | null;
  approver_username: string | null;
};

export function UpsellRow({ row }: { row: Upsell }) {
  const [name, setName] = useState(row.name);
  const [description, setDescription] = useState(row.description);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const dirty = name !== row.name || description !== row.description;
  const isApproved = row.approved_at != null && row.name === row.approved_name && row.description === row.approved_description;
  const isStale = row.approved_at != null && (row.name !== row.approved_name || row.description !== row.approved_description);

  function flash(msg: string, kind: 'ok' | 'err') {
    setError(null); setSuccess(null);
    if (kind === 'ok') setSuccess(msg); else setError(msg);
    setTimeout(() => { setSuccess(null); setError(null); }, 4000);
  }

  function save() {
    startTransition(async () => {
      const res = await updateUpsellAction(row.id, { name, description });
      if (res.ok) flash('Saved. Approval cleared.', 'ok'); else flash(res.error, 'err');
    });
  }

  function approve() {
    startTransition(async () => {
      const res = await approveUpsellAction(row.id);
      if (res.ok) flash('Approved.', 'ok'); else flash(res.error, 'err');
    });
  }

  function toggleEnabled() {
    startTransition(async () => {
      const res = await setUpsellEnabledAction(row.id, !row.enabled);
      if (res.ok) flash(row.enabled ? 'Disabled.' : 'Enabled.', 'ok');
      else flash(res.error, 'err');
    });
  }

  return (
    <div className="ix-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <code className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">{row.sku}</code>
          {row.price_usd != null && (
            <span className="text-xs text-slate-500 dark:text-slate-300">${Number(row.price_usd).toFixed(2)}</span>
          )}
        </div>
        <StatusPill enabled={row.enabled} approved={isApproved} stale={isStale} />
      </div>

      <div className="grid grid-cols-1 gap-2">
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-300 mb-0.5">Name</span>
          <input
            type="text" value={name} onChange={e => setName(e.target.value)}
            className="ix-input !py-1.5 !text-sm"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-300 mb-0.5">Description (shown to guest)</span>
          <textarea
            value={description} onChange={e => setDescription(e.target.value)}
            rows={3}
            className="ix-input font-mono !text-xs leading-relaxed"
          />
        </label>
      </div>

      {row.approved_at && (
        <div className="text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
          <ShieldCheck size={12} />
          Last approved {new Date(row.approved_at).toLocaleString()}
          {row.approver_username && <> by {row.approver_username}</>}
          {isStale && <span className="text-amber-600 dark:text-amber-300 ml-1"> · edited — re-approve to fire</span>}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-200 dark:border-slate-700">
        <button type="button" disabled={!dirty || pending} onClick={save}
          className="ix-btn-secondary !py-1.5 !text-xs disabled:opacity-50">
          <Save size={12} /> {pending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" disabled={dirty || pending || isApproved} onClick={approve}
          className="!py-1.5 !text-xs ix-btn-primary disabled:opacity-50">
          <CheckCircle2 size={12} /> {isApproved ? 'Approved' : 'Approve'}
        </button>
        <button type="button" disabled={pending || (!isApproved && !row.enabled)} onClick={toggleEnabled}
          className={`!py-1.5 !text-xs inline-flex items-center gap-1 px-3 rounded-lg border transition disabled:opacity-50 ${
            row.enabled
              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 hover:bg-rose-100'
              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
          }`}>
          <Power size={12} /> {row.enabled ? 'Disable' : 'Enable'}
        </button>
        {success && <span className="text-emerald-700 dark:text-emerald-300 text-xs">{success}</span>}
        {error && <span className="text-rose-700 dark:text-rose-300 text-xs flex items-center gap-1"><AlertTriangle size={11} /> {error}</span>}
      </div>
    </div>
  );
}

function StatusPill({ enabled, approved, stale }: { enabled: boolean; approved: boolean; stale: boolean }) {
  if (enabled && approved) return (
    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-200 inline-flex items-center gap-1"><ShieldCheck size={10} /> Live</span>
  );
  if (stale) return (
    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-200">Edited — re-approve</span>
  );
  if (approved) return (
    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-200">Approved · disabled</span>
  );
  return (
    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">Pending review</span>
  );
}
