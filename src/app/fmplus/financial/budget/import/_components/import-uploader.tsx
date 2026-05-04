'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, Upload, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { previewImportAction, commitImportAction, type PreviewResult } from '../actions';

export function ImportUploader() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [committed, setCommitted] = useState<{ committed: number; skipped: number; errors: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setCommitted(null);
    setError(null);
  };

  const onPreview = () => {
    if (!file) return;
    setError(null);
    setPreview(null);
    setCommitted(null);
    const fd = new FormData();
    fd.append('file', file);
    startTransition(async () => {
      try {
        const r = await previewImportAction(fd);
        setPreview(r);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const onCommit = () => {
    if (!preview || preview.rows.length === 0) return;
    if (!confirm(`Commit ${preview.rows.length} lines? This REPLACES all existing lines for the matching contract+year combinations.`)) return;
    setError(null);
    startTransition(async () => {
      try {
        const r = await commitImportAction(preview.rows);
        setCommitted(r);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="space-y-4 max-w-3xl">
      {/* File picker */}
      {!preview && !committed && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-indigo-600 dark:text-indigo-400" />
            <strong className="text-sm text-slate-900 dark:text-slate-100">Upload XLSX</strong>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Auto-detects layout and parses. v2.0 commits flat-template uploads.
            Rich AUC / TRIO / CityGate / Emaar parsers ship in v2.1 — for those, re-export to flat first.
          </p>
          <input type="file" accept=".xlsx,.xls"
            onChange={e => setFile(e.currentTarget.files?.[0] ?? null)}
            disabled={isPending}
            className="block w-full text-xs text-slate-500 dark:text-slate-400
              file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-slate-200 dark:border-slate-700
              file:bg-slate-50 dark:bg-slate-800 file:text-slate-900 dark:text-slate-100 file:text-xs
              file:cursor-pointer hover:file:bg-white dark:bg-slate-900" />
          {file && (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Selected: <strong className="text-slate-900 dark:text-slate-100">{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
            </div>
          )}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-xs text-red-400 flex items-start gap-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> <div>{error}</div>
            </div>
          )}
          <div className="flex gap-2">
            <a href="/api/fmplus/budget/flat-template-download"
              className="text-xs px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700">
              Download blank template
            </a>
            <button type="button" onClick={onPreview} disabled={!file || isPending}
              className="text-xs px-4 py-1.5 bg-indigo-600 text-white rounded font-semibold flex items-center gap-1 disabled:opacity-50 ml-auto">
              <Upload size={12} /> {isPending ? 'Parsing…' : 'Preview & Validate'}
            </button>
          </div>
        </div>
      )}

      {/* Preview */}
      {preview && !committed && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <strong className="text-sm text-slate-900 dark:text-slate-100">
              Preview &middot; parser: <span className="text-indigo-600 dark:text-indigo-400">{preview.parser}</span>
            </strong>
            <button onClick={reset} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"><X size={14} /></button>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{preview.reason} &middot; sheets: {preview.sheetNames.join(', ')}</p>

          {preview.errors.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3 text-xs">
              <strong className="text-amber-400">{preview.errors.length} error{preview.errors.length === 1 ? '' : 's'}</strong>
              <ul className="mt-1 space-y-0.5 text-slate-500 dark:text-slate-400">
                {preview.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>Row {e.row}: {e.message}</li>
                ))}
                {preview.errors.length > 5 && <li>+ {preview.errors.length - 5} more&hellip;</li>}
              </ul>
            </div>
          )}

          {preview.byContract.length > 0 && (
            <div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase mb-1">Will affect ({preview.byContract.length} group{preview.byContract.length === 1 ? '' : 's'})</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-slate-500 dark:text-slate-400 uppercase border-b border-slate-200 dark:border-slate-700 text-left">
                    <th className="px-2 py-1">Contract</th>
                    <th className="px-2 py-1">Year</th>
                    <th className="px-2 py-1 text-right">Lines</th>
                    <th className="px-2 py-1 text-center">Contract</th>
                    <th className="px-2 py-1 text-center">Year</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.byContract.map(g => (
                    <tr key={`${g.contract_name}|${g.year_index}`} className="border-b border-slate-200 dark:border-slate-700">
                      <td className="px-2 py-1.5 font-medium">{g.contract_name}</td>
                      <td className="px-2 py-1.5">Y{g.year_index}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{g.line_count}</td>
                      <td className="px-2 py-1.5 text-center">{g.contract_exists ? '✅' : <span className="text-red-400">❌ not found</span>}</td>
                      <td className="px-2 py-1.5 text-center">{g.year_exists ? '✅' : <span className="text-amber-400">create year first</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
            <button onClick={reset} disabled={isPending}
              className="text-xs px-3 py-1.5 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded">Cancel</button>
            <button onClick={onCommit} disabled={isPending || preview.rows.length === 0}
              className="text-xs px-4 py-1.5 bg-indigo-600 text-white rounded font-semibold flex items-center gap-1 disabled:opacity-50 ml-auto">
              <CheckCircle2 size={12} /> {isPending ? 'Committing…' : `Commit ${preview.rows.length} lines`}
            </button>
          </div>
        </div>
      )}

      {/* Committed */}
      {committed && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle2 size={18} />
            <strong className="text-sm">Import complete</strong>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800 rounded p-3 text-xs space-y-1">
            <div className="flex justify-between"><span>Committed:</span> <strong className="tabular-nums text-green-400">{committed.committed}</strong></div>
            <div className="flex justify-between"><span>Skipped:</span> <strong className="tabular-nums text-amber-400">{committed.skipped}</strong></div>
          </div>
          {committed.errors.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-xs text-red-400">
              {committed.errors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
          <button onClick={reset}
            className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded font-semibold">Import another file</button>
        </div>
      )}
    </div>
  );
}
