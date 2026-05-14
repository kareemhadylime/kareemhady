'use client';

import { useState, useTransition } from 'react';
import { X, Upload, CheckCircle2, RefreshCw } from 'lucide-react';
import { previewPayrollAction, confirmPayrollAction } from '@/lib/beithady/hr/hr-payroll-actions';
import type { PayrollPreviewResult, PayrollPreviewRow, MatchCandidate } from '@/lib/beithady/hr/hr-payroll-types';

type Step = 'upload' | 'preview' | 'done';
type Props = { open: boolean; onClose: () => void };

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function buildMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}
function buildLabel(year: number, month: number): string {
  return `${MONTHS[month - 1]} ${year}`;
}

export function UploadPayrollDialog({ open, onClose }: Props) {
  const now = new Date();
  const [step, setStep] = useState<Step>('upload');
  const [preview, setPreview] = useState<PayrollPreviewResult | null>(null);
  const [rows, setRows] = useState<PayrollPreviewRow[]>([]);
  const [parseError, setParseError] = useState('');
  const [monthYear, setMonthYear] = useState(now.getFullYear());
  const [monthNum, setMonthNum] = useState(now.getMonth() + 1);
  const [savedCount, setSavedCount] = useState(0);
  const [isPending, startTransition] = useTransition();

  function reset() { setStep('upload'); setPreview(null); setRows([]); setParseError(''); }

  async function handleFile(file: File) {
    setParseError('');
    const fd = new FormData();
    fd.append('file', file);
    startTransition(async () => {
      const res = await previewPayrollAction(fd);
      if (res.error) { setParseError(res.error); return; }
      if (res.result) {
        setPreview(res.result);
        setRows(res.result.rows);
        const [y, m] = res.result.suggestedMonthKey.split('-');
        setMonthYear(Number(y));
        setMonthNum(Number(m));
        setStep('preview');
      }
    });
  }

  function updateMatch(rowIndex: number, employeeId: string) {
    setRows(rs => rs.map(r =>
      r.rowIndex === rowIndex
        ? { ...r, matchStatus: 'matched' as const, matchedEmployeeId: employeeId, matchCandidates: [] }
        : r
    ));
  }

  function handleConfirm() {
    const key = buildMonthKey(monthYear, monthNum);
    const label = buildLabel(monthYear, monthNum);
    startTransition(async () => {
      const res = await confirmPayrollAction(key, label, rows);
      if (res.error) { setParseError(res.error); return; }
      setSavedCount(rows.filter(r => r.matchStatus !== 'error').length);
      setStep('done');
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <h2 className="text-lg font-semibold">Upload Monthly Payroll</h2>
          <button onClick={() => { reset(); onClose(); }} className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={16} />
          </button>
        </div>

        {/* Steps indicator */}
        <div className="flex border-b border-slate-200 dark:border-slate-700 px-6 shrink-0">
          {(['upload', 'preview', 'done'] as Step[]).map((s, i) => (
            <div key={s} className={`flex items-center gap-2 px-4 py-3 text-sm ${step === s ? 'text-violet-600 font-medium border-b-2 border-violet-500' : 'text-slate-400'}`}>
              <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-semibold ${step === s ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/40' : 'bg-slate-100 dark:bg-slate-800'}`}>{i + 1}</span>
              {s === 'upload' ? 'Upload' : s === 'preview' ? 'Preview & Match' : 'Saved'}
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1 */}
          {step === 'upload' && (
            <div>
              <div
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                onDragOver={e => e.preventDefault()}
                className="border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl p-12 text-center hover:border-violet-400 transition-colors">
                <Upload size={32} className="mx-auto text-slate-400 mb-3" />
                <p className="font-semibold text-slate-700 dark:text-slate-200">Drop the monthly salary Excel here</p>
                <p className="text-sm text-slate-500 mt-1">Same format as the April salary sheet (.xlsx · .xls)</p>
                <input type="file" accept=".xlsx,.xls" className="hidden" id="payroll-upload"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
                <label htmlFor="payroll-upload" className="mt-4 inline-block cursor-pointer px-5 py-2 bg-violet-600 text-white text-sm font-semibold rounded-lg hover:bg-violet-700">
                  Choose File
                </label>
              </div>
              {isPending && (
                <p className="mt-3 text-sm text-violet-600 flex items-center gap-2">
                  <RefreshCw size={12} className="animate-spin" /> Parsing…
                </p>
              )}
              {parseError && <p className="mt-3 text-sm text-red-600 dark:text-red-400">{parseError}</p>}
              <div className="mt-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800 text-sm text-slate-600 dark:text-slate-300 space-y-1">
                <p className="font-semibold">Expected columns (order flexible):</p>
                <p>Name · JobTitle · Working days · S.Package · OT · Transportation Allowance · Bonus · Travel Allowance · salary in advance · Deduction · Net Salary · Analytic</p>
              </div>
            </div>
          )}

          {/* Step 2 */}
          {step === 'preview' && preview && (
            <div>
              {/* Month picker */}
              <div className="flex items-center gap-3 mb-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg flex-wrap">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-300">Saving as:</span>
                <select className="ix-input w-auto" value={monthNum} onChange={e => setMonthNum(Number(e.target.value))}>
                  {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
                <select className="ix-input w-auto" value={monthYear} onChange={e => setMonthYear(Number(e.target.value))}>
                  {[2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
                </select>
                <span className="text-sm font-semibold text-violet-600">{buildLabel(monthYear, monthNum)}</span>
              </div>

              {/* Summary chips */}
              <div className="flex gap-2 mb-4 flex-wrap">
                <Chip color="emerald" label={`${preview.matchedCount} Matched`} />
                <Chip color="amber" label={`${preview.unmatchedCount} Unmatched`} />
                {preview.ambiguousCount > 0 && <Chip color="orange" label={`${preview.ambiguousCount} Ambiguous — resolve below`} />}
                {preview.errorCount > 0 && <Chip color="red" label={`${preview.errorCount} Errors (skipped)`} />}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      <th className="text-left py-2 pr-3">Name (sheet)</th>
                      <th className="text-left py-2 pr-3">Match</th>
                      <th className="text-right py-2 pr-3">Net</th>
                      <th className="text-center py-2">Days</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.rowIndex} className={`border-b border-slate-100 dark:border-slate-800 ${row.matchStatus === 'error' ? 'opacity-40' : ''}`}>
                        <td className="py-2 pr-3 font-medium">{row.sheet_name}</td>
                        <td className="py-2 pr-3">
                          {row.matchStatus === 'matched' && (
                            <span className="text-xs px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-semibold">✓ matched</span>
                          )}
                          {row.matchStatus === 'unmatched' && (
                            <span className="text-xs text-amber-600">⚠ unmatched</span>
                          )}
                          {row.matchStatus === 'ambiguous' && (
                            <select className="ix-input text-xs py-0.5" defaultValue=""
                              onChange={e => { if (e.target.value) updateMatch(row.rowIndex, e.target.value); }}>
                              <option value="" disabled>Pick employee…</option>
                              {row.matchCandidates.map((c: MatchCandidate) => (
                                <option key={c.id} value={c.id}>{c.name} ({c.company_id})</option>
                              ))}
                            </select>
                          )}
                          {row.matchStatus === 'error' && (
                            <span className="text-xs text-red-500">❌ skipped</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-slate-700 dark:text-slate-300">
                          {row.net_salary.toLocaleString()}
                        </td>
                        <td className="py-2 text-center text-slate-500">{row.working_days}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step 3 */}
          {step === 'done' && (
            <div className="py-12 text-center space-y-4">
              <CheckCircle2 size={48} className="mx-auto text-emerald-500" />
              <h3 className="text-xl font-semibold">{savedCount} payroll entries saved</h3>
              <p className="text-sm text-slate-500">Saved as {buildLabel(monthYear, monthNum)}. Print payslips from the payroll page.</p>
            </div>
          )}

          {parseError && step !== 'upload' && (
            <p className="mt-3 text-sm text-red-600 dark:text-red-400">{parseError}</p>
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
                ← Back
              </button>
              <button onClick={handleConfirm} disabled={isPending}
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-60">
                {isPending ? 'Saving…' : `Save ${buildLabel(monthYear, monthNum)} Payroll`}
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

function Chip({ label, color }: { label: string; color: 'emerald' | 'amber' | 'orange' | 'red' }) {
  const cls: Record<string, string> = {
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    amber:   'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    orange:  'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    red:     'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-semibold ${cls[color]}`}>
      {label}
    </span>
  );
}
