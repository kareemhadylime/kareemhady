// src/app/beithady/hr/team/_components/import-dialog.tsx
'use client';

import { useState, useTransition } from 'react';
import { X, Upload, CheckCircle2, AlertCircle, AlertTriangle } from 'lucide-react';
import { parseImportFile } from '@/lib/beithady/hr/hr-import';
import { importEmployeesAction } from '@/lib/beithady/hr/hr-actions';
import { BUILDING_LABELS } from '@/lib/beithady/hr/hr-types';
import type { ImportPreviewResult, ImportRow } from '@/lib/beithady/hr/hr-types';

type Step = 'upload' | 'preview' | 'done';
type Props = { open: boolean; onClose: () => void };

export function ImportDialog({ open, onClose }: Props) {
  const [step, setStep] = useState<Step>('upload');
  const [preview, setPreview] = useState<ImportPreviewResult | null>(null);
  const [parseError, setParseError] = useState('');
  const [result, setResult] = useState<{ imported: number; skipped: number } | null>(null);
  const [isPending, startTransition] = useTransition();

  function reset() { setStep('upload'); setPreview(null); setParseError(''); setResult(null); }

  async function handleFile(file: File) {
    setParseError('');
    try {
      const buf = await file.arrayBuffer();
      const pr = await parseImportFile(buf);
      setPreview(pr);
      setStep('preview');
    } catch (e) {
      setParseError(e instanceof Error ? e.message : 'Could not parse file');
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleConfirm() {
    if (!preview) return;
    const toImport = preview.rows.filter(r => r.validationState !== 'error');
    startTransition(async () => {
      const res = await importEmployeesAction(toImport);
      setResult({ imported: res.imported, skipped: res.skipped + res.errors.length });
      setStep('done');
    });
  }

  function toggleTerminated(rowIndex: number) {
    if (!preview) return;
    setPreview(p => {
      if (!p) return p;
      const rows = p.rows.map((r): ImportRow =>
        r.rowIndex === rowIndex
          ? { ...r, status: r.status === 'terminated' ? 'on_job' : 'terminated', isRedRow: !r.isRedRow }
          : r
      );
      const readyCount = rows.filter(r => r.validationState === 'ready').length;
      const incompleteCount = rows.filter(r => r.validationState === 'incomplete').length;
      const errorCount = rows.filter(r => r.validationState === 'error').length;
      return { rows, readyCount, incompleteCount, errorCount };
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <h2 className="text-lg font-semibold">Import Team Members</h2>
          <button onClick={() => { reset(); onClose(); }}
            className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        {/* Step indicators */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 px-6 shrink-0">
          {(['upload', 'preview', 'done'] as Step[]).map((s, i) => (
            <div key={s} className={`flex items-center gap-2 px-4 py-3 text-sm ${step === s ? 'text-violet-600 font-medium border-b-2 border-violet-500' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-semibold ${step === s ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/40' : 'bg-slate-100 dark:bg-slate-800'}`}>{i + 1}</span>
              {s === 'upload' ? 'Upload' : s === 'preview' ? 'Preview & Validate' : 'Done'}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1 */}
          {step === 'upload' && (
            <div>
              <div onDrop={handleDrop} onDragOver={e => e.preventDefault()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-12 text-center hover:border-violet-400 transition-colors">
                <Upload size={32} className="mx-auto text-slate-400 mb-3" />
                <p className="font-semibold text-slate-700 dark:text-slate-200">Drop your Excel file here</p>
                <p className="text-sm text-slate-500 mt-1">or click to browse (.xlsx · .xls)</p>
                <input type="file" accept=".xlsx,.xls" className="hidden" id="import-file"
                  onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
                <label htmlFor="import-file" className="mt-4 inline-block cursor-pointer px-5 py-2 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700">
                  Choose File
                </label>
              </div>
              {parseError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{parseError}</p>}
              <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-slate-600 dark:text-slate-300 space-y-1">
                <p className="font-semibold">Expected columns (order flexible):</p>
                <p>Name · JobTitle · S.Package · Transportation Allowance · Bonus · Analytic</p>
                <p className="mt-2 text-xs text-slate-400">Red-highlighted rows auto-detected as Terminated. Toggle in Step 2 if detection misses any.</p>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 'preview' && preview && (
            <div>
              <div className="flex gap-3 mb-4">
                <Chip icon={<CheckCircle2 size={14} />} label={`${preview.readyCount} Ready`} color="emerald" />
                <Chip icon={<AlertTriangle size={14} />} label={`${preview.incompleteCount} Incomplete`} color="amber" />
                <Chip icon={<AlertCircle size={14} />} label={`${preview.errorCount} Errors (skipped)`} color="red" />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="text-left py-2 pr-3">Name</th>
                      <th className="text-left py-2 pr-3">Position</th>
                      <th className="text-left py-2 pr-3">Building</th>
                      <th className="text-right py-2 pr-3">Salary</th>
                      <th className="text-center py-2 pr-3">Status</th>
                      <th className="text-center py-2">State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map(row => (
                      <tr key={row.rowIndex}
                        className={`border-b border-slate-100 dark:border-slate-800 ${row.validationState === 'error' ? 'opacity-50 bg-red-50 dark:bg-red-950/20' : ''}`}>
                        <td className="py-2 pr-3 font-medium">{row.first_name}</td>
                        <td className="py-2 pr-3 text-slate-500">{row.position || '—'}</td>
                        <td className="py-2 pr-3 text-slate-500">
                          {row.building_code ? BUILDING_LABELS[row.building_code] : <span className="text-amber-600">?</span>}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-slate-700 dark:text-slate-300">
                          {row.salary_package.toLocaleString()}
                        </td>
                        <td className="py-2 pr-3 text-center">
                          <button onClick={() => toggleTerminated(row.rowIndex)}
                            className={`text-xs px-2 py-0.5 rounded font-semibold ${
                              row.status === 'terminated'
                                ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                            }`}>
                            {row.status === 'terminated' ? 'Terminated' : 'On Job'}
                          </button>
                        </td>
                        <td className="py-2 text-center">
                          {row.validationState === 'ready'      && <CheckCircle2 size={14} className="text-emerald-500 mx-auto" />}
                          {row.validationState === 'incomplete' && <span title={row.incompleteFields.join(', ')} className="flex justify-center"><AlertTriangle size={14} className="text-amber-500" /></span>}
                          {row.validationState === 'error'      && <span title={row.errors.join(', ')} className="flex justify-center"><AlertCircle size={14} className="text-red-500" /></span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 'done' && result && (
            <div className="py-12 text-center space-y-4">
              <CheckCircle2 size={48} className="mx-auto text-emerald-500" />
              <h3 className="text-xl font-semibold">{result.imported} employees imported</h3>
              {result.skipped > 0 && (
                <p className="text-sm text-slate-500">{result.skipped} rows were skipped (errors or validation failures).</p>
              )}
              <p className="text-sm text-slate-500">Employees with missing fields are marked in the roster.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-200 dark:border-slate-700 px-6 py-4 flex justify-end gap-3">
          {step === 'upload' && (
            <button onClick={() => { reset(); onClose(); }}
              className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">
              Cancel
            </button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={reset}
                className="px-4 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800">
                Back
              </button>
              <button onClick={handleConfirm} disabled={isPending}
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60">
                {isPending ? 'Importing…' : `Import ${(preview?.readyCount ?? 0) + (preview?.incompleteCount ?? 0)} employees`}
              </button>
            </>
          )}
          {step === 'done' && (
            <button onClick={() => { reset(); onClose(); }}
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700">
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Chip({ icon, label, color }: { icon: React.ReactNode; label: string; color: 'emerald' | 'amber' | 'red' }) {
  const cls = { emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300', red: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' }[color];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold ${cls}`}>
      {icon} {label}
    </span>
  );
}
