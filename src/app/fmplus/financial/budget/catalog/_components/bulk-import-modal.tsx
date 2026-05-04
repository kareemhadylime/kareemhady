'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Upload, X, CheckCircle2, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { bulkImportAction, type BulkImportSummary } from '../actions';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function BulkImportModal({ open, onClose }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<BulkImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const reset = () => {
    setFile(null);
    setSummary(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!file) return;
    setError(null);
    setSummary(null);
    const fd = new FormData();
    fd.append('file', file);
    startTransition(async () => {
      try {
        const result = await bulkImportAction(fd);
        setSummary(result);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg max-w-md w-full overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-indigo-600 dark:text-indigo-400" />
            <strong className="text-sm text-slate-900 dark:text-slate-100">Bulk import catalog (XLSX)</strong>
          </div>
          <button onClick={handleClose} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3 text-sm">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Upload an XLSX file with an &quot;Items Pricelist&quot; sheet (or as the first sheet). Existing items
            with matching <code className="text-[10px]">code</code> will be updated. New items will be added.
            Items not in the upload are NOT auto-archived.
          </p>

          {!summary && !error && (
            <>
              <label className="block">
                <input
                  ref={inputRef}
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={(e) => {
                    const f = e.currentTarget.files?.[0];
                    setFile(f ?? null);
                  }}
                  className="block w-full text-xs text-slate-500 dark:text-slate-400
                    file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-slate-200 dark:border-slate-700
                    file:bg-slate-50 dark:bg-slate-800 file:text-slate-900 dark:text-slate-100 file:text-xs
                    file:cursor-pointer hover:file:bg-white dark:bg-slate-900"
                  disabled={isPending}
                />
              </label>
              {file && (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Selected: <strong className="text-slate-900 dark:text-slate-100">{file.name}</strong>
                  {' '}({(file.size / 1024).toFixed(1)} KB)
                </div>
              )}
            </>
          )}

          {summary && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle2 size={16} />
                <strong>Import complete</strong>
              </div>
              <div className="bg-white dark:bg-slate-900 rounded p-3 text-xs space-y-1">
                <div className="flex justify-between"><span>Total parsed:</span><strong className="tabular-nums">{summary.total}</strong></div>
                <div className="flex justify-between text-green-400"><span>Added:</span><strong className="tabular-nums">{summary.added}</strong></div>
                <div className="flex justify-between text-amber-400"><span>Updated:</span><strong className="tabular-nums">{summary.updated}</strong></div>
                <div className="flex justify-between text-slate-500 dark:text-slate-400"><span>Archived:</span><strong className="tabular-nums">{summary.archived}</strong></div>
              </div>
              {summary.errors.length > 0 && (
                <div className="text-[11px] text-red-400">
                  {summary.errors.length} warnings: {summary.errors.slice(0, 3).join('; ')}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-xs text-red-400 flex items-start gap-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              <div>
                <strong>Import failed</strong>
                <div className="mt-1 text-slate-500 dark:text-slate-400">{error}</div>
              </div>
            </div>
          )}
        </div>

        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="text-xs px-3 py-1.5 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded hover:bg-slate-50 dark:hover:bg-slate-700"
            disabled={isPending}>
            {summary ? 'Close' : 'Cancel'}
          </button>
          {!summary && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!file || isPending}
              className="text-xs px-4 py-1.5 bg-indigo-600 text-white rounded font-semibold flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed">
              <Upload size={12} />
              {isPending ? 'Importing…' : 'Preview & Commit'}
            </button>
          )}
          {summary && (
            <button
              type="button"
              onClick={reset}
              className="text-xs px-4 py-1.5 bg-indigo-600 text-white rounded font-semibold">
              Import another
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
