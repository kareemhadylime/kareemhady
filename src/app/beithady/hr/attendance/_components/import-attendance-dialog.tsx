'use client';

import { useState, useTransition } from 'react';
import { X, Upload, CheckCircle2 } from 'lucide-react';
import { previewAttendanceAction, confirmAttendanceAction } from '@/lib/beithady/hr/hr-attendance-actions';
import type { AttendancePreviewResult, AttendancePreviewRow } from '@/lib/beithady/hr/hr-attendance-types';

type Step = 'upload' | 'preview' | 'done';
type Props = {
  open: boolean;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
};

const STATUS_PILL: Record<string, string> = {
  matched:   'bg-violet-900/50 text-violet-300',
  unmatched: 'bg-amber-900/50 text-amber-300',
  protected: 'bg-slate-700 text-slate-400',
  error:     'bg-red-900/50 text-red-300',
};

export function ImportAttendanceDialog({ open, defaultDate, onClose, onSaved }: Props) {
  const [step, setStep]       = useState<Step>('upload');
  const [preview, setPreview] = useState<AttendancePreviewResult | null>(null);
  const [rows, setRows]       = useState<AttendancePreviewRow[]>([]);
  const [date, setDate]       = useState(defaultDate);
  const [parseError, setParseError] = useState('');
  const [savedCount, setSavedCount] = useState(0);
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  function reset() { setStep('upload'); setPreview(null); setRows([]); setParseError(''); }
  function handleClose() { reset(); onClose(); }

  async function handleFile(file: File) {
    setParseError('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('date', date);
    startTransition(async () => {
      const res = await previewAttendanceAction(fd);
      if (res.error) { setParseError(res.error); return; }
      if (res.result) {
        setPreview(res.result);
        setRows(res.result.rows);
        if (res.result.suggestedDate) setDate(res.result.suggestedDate);
        setStep('preview');
      }
    });
  }

  async function handleConfirm() {
    startTransition(async () => {
      const res = await confirmAttendanceAction(date, rows);
      if (res.error) { setParseError(res.error); return; }
      setSavedCount(res.saved);
      setStep('done');
      onSaved();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-neutral-900 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-base font-semibold text-white">Import Attendance</h2>
          <button onClick={handleClose} className="text-white/40 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {step === 'upload' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/50 mb-1 uppercase tracking-wide">
                  Attendance Date
                </label>
                <input
                  type="date"
                  value={date}
                  onChange={e => setDate(e.target.value)}
                  className="ix-input w-48"
                />
              </div>
              <label
                className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-white/20 rounded-xl p-10 cursor-pointer hover:border-violet-500/50 transition-colors"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              >
                <Upload className="w-8 h-8 text-white/30" />
                <span className="text-sm text-white/50">Drop .xlsx / .xls or click to browse</span>
                <input type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
              </label>
              {isPending && <p className="text-sm text-white/40 text-center">Parsing…</p>}
              {parseError && <p className="text-sm text-red-400">{parseError}</p>}
            </div>
          )}

          {step === 'preview' && preview && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-white/60">
                <span>Importing attendance for</span>
                <span className="font-semibold text-white">{date}</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <span className="text-xs px-2 py-1 rounded-full bg-violet-900/50 text-violet-300">{preview.matchedCount} matched</span>
                <span className="text-xs px-2 py-1 rounded-full bg-amber-900/50 text-amber-300">{preview.unmatchedCount} unmatched</span>
                {preview.protectedCount > 0 && (
                  <span className="text-xs px-2 py-1 rounded-full bg-slate-700 text-slate-400">{preview.protectedCount} protected</span>
                )}
                {preview.errorCount > 0 && (
                  <span className="text-xs px-2 py-1 rounded-full bg-red-900/50 text-red-300">{preview.errorCount} errors</span>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-left text-xs text-white/40 uppercase tracking-wide">
                      <th className="pb-2 pr-4">Name</th>
                      <th className="pb-2 pr-4">BH-ID</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2">Match</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.rowIndex} className="border-b border-white/5">
                        <td className="py-1.5 pr-4 text-white">{r.sheet_name}</td>
                        <td className="py-1.5 pr-4 text-white/60">{r.bh_id_raw || '—'}</td>
                        <td className="py-1.5 pr-4 text-white/60 capitalize">{r.status_raw || '—'}</td>
                        <td className="py-1.5">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_PILL[r.matchStatus]}`}>
                            {r.matchStatus}
                          </span>
                          {r.errorMessage && (
                            <span className="ml-2 text-xs text-red-400">{r.errorMessage}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {parseError && <p className="text-sm text-red-400">{parseError}</p>}
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              <p className="text-lg font-semibold text-white">{savedCount} records saved</p>
              <p className="text-sm text-white/50">Pending admin approval</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
          {step === 'upload' && (
            <button onClick={handleClose} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">
              Cancel
            </button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={reset} className="px-4 py-2 text-sm text-white/60 hover:text-white transition-colors">
                ← Re-upload
              </button>
              <button
                onClick={handleConfirm}
                disabled={isPending || preview?.matchedCount === 0}
                className="px-5 py-2 text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors disabled:opacity-50"
              >
                {isPending ? 'Saving…' : `Save ${preview?.matchedCount ?? 0} records`}
              </button>
            </>
          )}
          {step === 'done' && (
            <button onClick={handleClose} className="px-5 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors">
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}