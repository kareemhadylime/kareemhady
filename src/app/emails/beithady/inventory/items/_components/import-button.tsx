'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { X, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { previewImportAction, commitImportAction, type ImportPreview } from '../actions';

export function ImportButton({
  triggerLabel, triggerClass,
}: {
  triggerLabel: ReactNode;
  triggerClass: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [committed, setCommitted] = useState<{ created: number; updated: number; skipped: number } | null>(null);

  function reset() {
    setError(null);
    setPreview(null);
    setCommitted(null);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setPreview(null);
    setCommitted(null);

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const base64 = dataUrl.split(',')[1] || '';
      startTransition(async () => {
        const res = await previewImportAction(base64);
        if (res.ok) setPreview(res);
        else setError(res.error);
      });
    };
    reader.onerror = () => setError('Failed to read file');
    reader.readAsDataURL(file);
  }

  async function handleCommit() {
    if (!preview) return;
    if (!confirm(`Commit ${preview.willCreate} new + ${preview.willUpdate} updates? This is irreversible.`)) return;
    setError(null);
    startTransition(async () => {
      const res = await commitImportAction(preview._payload);
      if (res.ok) {
        setCommitted({ created: res.created, updated: res.updated, skipped: res.skipped });
        setPreview(null);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); reset(); }} className={triggerClass}>
        {triggerLabel}
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-2xl my-4">
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white rounded-t-xl">
              <h3 className="text-sm font-semibold inline-flex items-center gap-2" style={{ color: 'var(--bh-navy)' }}>
                <FileSpreadsheet size={16} /> Import items from Excel
              </h3>
              <button type="button" onClick={() => { setOpen(false); reset(); }} className="text-slate-400 hover:text-slate-700"><X size={18} /></button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {!preview && !committed && (
                <>
                  <div className="text-slate-600">
                    Upload your filled-in <code className="font-mono text-[11px]">beithady-inventory-items-template.xlsx</code> file. The system will parse, validate, and show a preview before any DB writes.
                  </div>
                  <input
                    type="file"
                    accept=".xlsx,.xlsm"
                    onChange={handleFile}
                    disabled={pending}
                    className="block w-full text-xs file:mr-3 file:py-2 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-cyan-50 file:text-cyan-700 hover:file:bg-cyan-100"
                  />
                  {pending && <div className="text-slate-500">Parsing…</div>}
                </>
              )}

              {preview && (
                <>
                  <div className="grid grid-cols-4 gap-2">
                    <Stat label="Total rows" value={String(preview.total)} tone="neutral" />
                    <Stat label="Will create" value={String(preview.willCreate)} tone={preview.willCreate > 0 ? 'emerald' : 'neutral'} />
                    <Stat label="Will update" value={String(preview.willUpdate)} tone={preview.willUpdate > 0 ? 'cyan' : 'neutral'} />
                    <Stat label="Errors" value={String(preview.invalid)} tone={preview.invalid > 0 ? 'rose' : 'neutral'} />
                  </div>

                  <div className="max-h-[40vh] overflow-y-auto border border-slate-200 rounded">
                    <table className="w-full text-[11px]">
                      <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500 sticky top-0">
                        <tr>
                          <th className="text-left px-2 py-1.5 w-10">Row</th>
                          <th className="text-left px-2 py-1.5">SKU</th>
                          <th className="text-left px-2 py-1.5">Name</th>
                          <th className="text-left px-2 py-1.5">Status / Issues</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map(r => (
                          <tr key={r.rowNum} className="border-t border-slate-100">
                            <td className="px-2 py-1.5 text-slate-500 tabular-nums">{r.rowNum}</td>
                            <td className="px-2 py-1.5 font-mono">{r.sku}</td>
                            <td className="px-2 py-1.5">
                              {r.name_en || <span className="text-slate-400 italic">—</span>}
                            </td>
                            <td className="px-2 py-1.5">
                              {r.status === 'create' && <span className="text-emerald-700 font-medium">New</span>}
                              {r.status === 'update' && <span className="text-cyan-700 font-medium">Update existing</span>}
                              {r.status === 'error' && (
                                <span className="text-rose-700">
                                  <AlertCircle size={11} className="inline mr-1" />
                                  {r.errors.join('; ')}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                    <button type="button" onClick={reset} className="px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-700">Choose different file</button>
                    <button
                      type="button"
                      onClick={handleCommit}
                      disabled={pending || preview.valid === 0}
                      className="px-3 py-1.5 text-[11px] font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {pending ? 'Committing…' : `Commit ${preview.willCreate + preview.willUpdate} valid row${(preview.willCreate + preview.willUpdate) === 1 ? '' : 's'}`}
                    </button>
                  </div>
                </>
              )}

              {committed && (
                <div className="ix-card border-emerald-300 bg-emerald-50 p-4 text-xs space-y-2">
                  <div className="font-semibold text-emerald-900 inline-flex items-center gap-1">
                    <CheckCircle2 size={14} /> Import complete
                  </div>
                  <ul className="text-emerald-800 space-y-1">
                    <li>• Created: <strong>{committed.created}</strong></li>
                    <li>• Updated: <strong>{committed.updated}</strong></li>
                    <li>• Skipped (errors): <strong>{committed.skipped}</strong></li>
                  </ul>
                  <button type="button" onClick={() => { setOpen(false); reset(); window.location.reload(); }}
                    className="mt-2 px-3 py-1.5 text-[11px] font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700">
                    Refresh items list
                  </button>
                </div>
              )}

              {error && (
                <div className="text-rose-700 bg-rose-50 border border-rose-200 rounded p-2">{error}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'emerald' | 'cyan' | 'rose' | 'neutral' }) {
  const cls = tone === 'emerald' ? 'text-emerald-700' :
              tone === 'cyan' ? 'text-cyan-700' :
              tone === 'rose' ? 'text-rose-700' :
              'text-slate-700';
  return (
    <div className="ix-card p-2">
      <div className="text-[9px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-base font-bold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}
