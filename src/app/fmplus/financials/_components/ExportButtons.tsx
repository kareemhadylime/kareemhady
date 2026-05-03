'use client';

import { useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import { exportPnlToExcel, exportBsToExcel } from '../actions';

export type ExportProps = {
  view: 'pnl' | 'balance_sheet';
  granularity: string;
  periods: number;
  asof: string;
  mode: string;
  withDep: boolean;
  includeDrafts: boolean;
  plans?: string;
  plan?: string;
  accounts?: string;
};

export function ExportButtons(props: ExportProps) {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('granularity', props.granularity);
      fd.set('periods', String(props.periods));
      fd.set('asof', props.asof);
      fd.set('mode', props.mode);
      fd.set('with_dep', props.withDep ? '1' : '0');
      fd.set('include_drafts', props.includeDrafts ? '1' : '0');
      if (props.plans) fd.set('plans', props.plans);
      if (props.plan) fd.set('plan', props.plan);
      if (props.accounts) fd.set('accounts', props.accounts);
      const fn = props.view === 'pnl' ? exportPnlToExcel : exportBsToExcel;
      const res = await fn(fd);
      if (res.ok) {
        const a = document.createElement('a');
        a.href = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${res.base64}`;
        a.download = res.filename;
        a.click();
      } else {
        alert(`Export failed: ${res.error}`);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className="px-3 py-1.5 rounded bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 inline-flex items-center gap-1.5 disabled:opacity-60"
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
      Export Excel
    </button>
  );
}
