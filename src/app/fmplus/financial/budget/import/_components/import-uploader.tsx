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
        <div className="bg-bg-tertiary border border-border rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={18} className="text-accent" />
            <strong className="text-sm text-text-primary">Upload XLSX</strong>
          </div>
          <p className="text-xs text-text-secondary">
            Auto-detects layout and parses. v2.0 commits flat-template uploads.
            Rich AUC / TRIO / CityGate / Emaar parsers ship in v2.1 — for those, re-export to flat first.
          </p>
          <input type="file" accept=".xlsx,.xls"
            onChange={e => setFile(e.currentTarget.files?.[0] ?? null)}
            disabled={isPending}
            className="block w-full text-xs text-text-secondary
              file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-border
              file:bg-bg-secondary file:text-text-primary file:text-xs
              file:cursor-pointer hover:file:bg-bg-tertiary" />
          {file && (
            <div className="text-xs text-text-secondary">
              Selected: <strong className="text-text-primary">{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
            </div>
          )}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-xs text-red-400 flex items-start gap-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> <div>{error}</div>
            </div>
          )}
          <div className="flex gap-2">
            <a href="/api/fmplus/budget/flat-template-download"
              className="text-xs px-3 py-1.5 bg-bg-secondary border border-border rounded text-text-primary hover:bg-bg-tertiary">
              Download blank template
            </a>
            <button type="button" onClick={onPreview} disabled={!file || isPending}
              className="text-xs px-4 py-1.5 bg-accent text-white rounded font-semibold flex items-center gap-1 disabled:opacity-50 ml-auto">
              <Upload size={12} /> {isPending ? 'Parsing…' : 'Preview & Validate'}
            </button>
          </div>
        </div>
      )}

      {/* Preview */}
      {preview && !committed && (
        <div className="bg-bg-tertiary border border-border rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <strong className="text-sm text-text-primary">
              Preview &middot; parser: <span className="text-accent">{preview.parser}</span>
            </strong>
            <button onClick={reset} className="text-text-secondary hover:text-text-primary"><X size={14} /></button>
          </div>
          <p className="text-[11px] text-text-secondary">{preview.reason} &middot; sheets: {preview.sheetNames.join(', ')}</p>

          {preview.errors.length > 0 && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded p-3 text-xs">
              <strong className="text-amber-400">{preview.errors.length} error{preview.errors.length === 1 ? '' : 's'}</strong>
              <ul className="mt-1 space-y-0.5 text-text-secondary">
                {preview.errors.slice(0, 5).map((e, i) => (
                  <li key={i}>Row {e.row}: {e.message}</li>
                ))}
                {preview.errors.length > 5 && <li>+ {preview.errors.length - 5} more&hellip;</li>}
              </ul>
            </div>
          )}

          {preview.byContract.length > 0 && (
            <div>
              <div className="text-[10px] text-text-secondary uppercase mb-1">Will affect ({preview.byContract.length} group{preview.byContract.length === 1 ? '' : 's'})</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] text-text-secondary uppercase border-b border-border text-left">
                    <th className="px-2 py-1">Contract</th>
                    <th className="px-2 py-1">Year</th>
                    <th className="px-2 py-1 text-right">Lines</th>
                    <th className="px-2 py-1 text-center">Contract</th>
                    <th className="px-2 py-1 text-center">Year</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.byContract.map(g => (
                    <tr key={`${g.contract_name}|${g.year_index}`} className="border-b border-border">
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

          <div className="flex gap-2 pt-2 border-t border-border">
            <button onClick={reset} disabled={isPending}
              className="text-xs px-3 py-1.5 text-text-secondary border border-border rounded">Cancel</button>
            <button onClick={onCommit} disabled={isPending || preview.rows.length === 0}
              className="text-xs px-4 py-1.5 bg-accent text-white rounded font-semibold flex items-center gap-1 disabled:opacity-50 ml-auto">
              <CheckCircle2 size={12} /> {isPending ? 'Committing…' : `Commit ${preview.rows.length} lines`}
            </button>
          </div>
        </div>
      )}

      {/* Committed */}
      {committed && (
        <div className="bg-bg-tertiary border border-border rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2 text-green-400">
            <CheckCircle2 size={18} />
            <strong className="text-sm">Import complete</strong>
          </div>
          <div className="bg-bg-secondary rounded p-3 text-xs space-y-1">
            <div className="flex justify-between"><span>Committed:</span> <strong className="tabular-nums text-green-400">{committed.committed}</strong></div>
            <div className="flex justify-between"><span>Skipped:</span> <strong className="tabular-nums text-amber-400">{committed.skipped}</strong></div>
          </div>
          {committed.errors.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/30 rounded p-3 text-xs text-red-400">
              {committed.errors.slice(0, 5).map((e, i) => <div key={i}>{e}</div>)}
            </div>
          )}
          <button onClick={reset}
            className="text-xs px-3 py-1.5 bg-accent text-white rounded font-semibold">Import another file</button>
        </div>
      )}
    </div>
  );
}
