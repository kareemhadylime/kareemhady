'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, AlertTriangle, Save, Power, ShieldCheck } from 'lucide-react';
import {
  updatePreArrivalBodyAction,
  approvePreArrivalTemplateAction,
  setPreArrivalEnabledAction,
} from '../actions';

type Template = {
  id: string;
  building_code: string | null;
  language: string;
  body: string;
  enabled: boolean;
  approved_at: string | null;
  approved_by_user: string | null;
  approved_body: string | null;
  approver_username: string | null;
};

export function PreArrivalTemplateRow({ tpl }: { tpl: Template }) {
  const [body, setBody] = useState(tpl.body);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const dirty = body !== tpl.body;
  const isApproved = tpl.approved_at != null && tpl.body === tpl.approved_body;
  const isStale = tpl.approved_at != null && tpl.body !== tpl.approved_body;

  function flash(msg: string, kind: 'ok' | 'err') {
    setError(null);
    setSuccess(null);
    if (kind === 'ok') setSuccess(msg); else setError(msg);
    setTimeout(() => { setSuccess(null); setError(null); }, 4000);
  }

  function save() {
    startTransition(async () => {
      const res = await updatePreArrivalBodyAction(tpl.id, body);
      if (res.ok) flash('Saved. Approval cleared — re-approve before re-enabling.', 'ok');
      else flash(res.error, 'err');
    });
  }

  function approve() {
    startTransition(async () => {
      const res = await approvePreArrivalTemplateAction(tpl.id);
      if (res.ok) flash('Approved. You can now enable it for cron firing.', 'ok');
      else flash(res.error, 'err');
    });
  }

  function toggleEnabled() {
    startTransition(async () => {
      const res = await setPreArrivalEnabledAction(tpl.id, !tpl.enabled);
      if (res.ok) flash(tpl.enabled ? 'Disabled.' : 'Enabled — will fire on next cron.', 'ok');
      else flash(res.error, 'err');
    });
  }

  const buildingLabel = tpl.building_code || 'Default (any building)';

  return (
    <div className="ix-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold" style={{ color: 'var(--bh-heading)' }}>
            {buildingLabel}
          </span>
          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
            {tpl.language}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill enabled={tpl.enabled} approved={isApproved} stale={isStale} />
        </div>
      </div>

      <textarea
        value={body}
        onChange={e => setBody(e.target.value)}
        rows={Math.max(6, body.split('\n').length)}
        className="ix-input font-mono text-xs leading-relaxed w-full"
        placeholder="Template body…"
      />

      <div className="text-[11px] text-slate-500 dark:text-slate-300">
        Variables: <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{guest_name}'}</code>{' '}
        <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{listing}'}</code>{' '}
        <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{check_in}'}</code>{' '}
        <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">{'{host_phone}'}</code>
      </div>

      {tpl.approved_at && (
        <div className="text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
          <ShieldCheck size={12} />
          Last approved {new Date(tpl.approved_at).toLocaleString()}
          {tpl.approver_username && <> by {tpl.approver_username}</>}
          {isStale && <span className="text-amber-600 dark:text-amber-300 ml-1"> · body has been edited since — re-approve to fire</span>}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-200 dark:border-slate-700">
        <button
          type="button"
          disabled={!dirty || pending}
          onClick={save}
          className="ix-btn-secondary !py-1.5 !text-xs disabled:opacity-50"
        >
          <Save size={12} /> {pending ? 'Saving…' : 'Save body'}
        </button>
        <button
          type="button"
          disabled={dirty || pending || isApproved}
          onClick={approve}
          className="!py-1.5 !text-xs ix-btn-primary disabled:opacity-50"
          title={dirty ? 'Save first' : isApproved ? 'Already approved' : 'Approve current body'}
        >
          <CheckCircle2 size={12} /> {isApproved ? 'Approved' : 'Approve body'}
        </button>
        <button
          type="button"
          disabled={pending || (!isApproved && !tpl.enabled)}
          onClick={toggleEnabled}
          className={`!py-1.5 !text-xs inline-flex items-center gap-1 px-3 rounded-lg border transition disabled:opacity-50 ${
            tpl.enabled
              ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 hover:bg-rose-100'
              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
          }`}
        >
          <Power size={12} /> {tpl.enabled ? 'Disable' : 'Enable'}
        </button>
        {success && <span className="text-emerald-700 dark:text-emerald-300 text-xs">{success}</span>}
        {error && <span className="text-rose-700 dark:text-rose-300 text-xs flex items-center gap-1"><AlertTriangle size={11} /> {error}</span>}
      </div>
    </div>
  );
}

function StatusPill({ enabled, approved, stale }: { enabled: boolean; approved: boolean; stale: boolean }) {
  if (enabled && approved) {
    return (
      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-200 inline-flex items-center gap-1">
        <ShieldCheck size={10} /> Live
      </span>
    );
  }
  if (stale) {
    return (
      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-200">
        Edited — needs re-approval
      </span>
    );
  }
  if (approved) {
    return (
      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-200">
        Approved · disabled
      </span>
    );
  }
  return (
    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
      Pending review
    </span>
  );
}
