'use client';
import { useState, useTransition } from 'react';
import { previewImportAction, commitImportAction } from '../actions';
import type { FlatRow } from '@/lib/fmplus/budget/parsers/flat-template';
import type { Scenario } from '@/lib/fmplus/budget/schema';
import { PreviewGrid } from './preview-grid';

export function ImportUploader({ projects }: { projects: Array<{ id: number; name: string }> }) {
  const [projectId, setProjectId] = useState<number | null>(null);
  const [year, setYear] = useState(new Date().getUTCFullYear());
  const [scenario, setScenario] = useState<Scenario>('initial');
  const [startMonth, setStartMonth] = useState(1);
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<{ format: 'rich'|'flat'; rows: FlatRow[]; warnings: string[]; totals: { byCategory: Record<string, { high: number; low: number }>; high: number; low: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [committed, setCommitted] = useState<number | null>(null);

  const onFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      startTransition(async () => {
        setError(null); setPreview(null);
        const res = await previewImportAction({ fileBase64: base64, projectId, fiscalYear: year, scenario });
        if (res.ok) setPreview({ format: res.format, rows: res.rows, warnings: res.warnings, totals: res.totals });
        else setError(res.error);
      });
    };
    reader.readAsDataURL(file);
  };

  const commit = (publish: boolean) => {
    if (!preview || !projectId) return;
    startTransition(async () => {
      const res = await commitImportAction({
        rows: preview.rows, projectId, fiscalYear: year,
        scenario, startMonth, publish,
      });
      if (res.ok) setCommitted(res.budgetId ?? 0);
      else setError(res.error ?? 'Commit failed');
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <label className="text-sm">Project:&nbsp;
          <select value={projectId ?? ''} onChange={e => setProjectId(e.target.value ? Number(e.target.value) : null)}
                  className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1">
            <option value="">— pick project —</option>
            {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="text-sm">Year:&nbsp;
          <select value={year} onChange={e => setYear(Number(e.target.value))}
                  className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1">
            {[2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        <label className="text-sm">Scenario:&nbsp;
          <select value={scenario} onChange={e => setScenario(e.target.value as Scenario)}
                  className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1">
            <option value="initial">Initial</option>
            <option value="revised">Revised</option>
            <option value="reforecast">Re-forecast</option>
          </select>
        </label>
        <label className="text-sm">Start month:&nbsp;
          <select value={startMonth} onChange={e => setStartMonth(Number(e.target.value))}
                  className="rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1">
            {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{new Date(2000, m-1, 1).toLocaleString('en', { month: 'short' })}</option>)}
          </select>
        </label>
      </div>

      <input type="file" accept=".xlsx"
             onChange={e => { const f = e.currentTarget.files?.[0]; if (f) onFile(f); }}
             className="block text-sm" />
      {pending && <p className="text-sm text-slate-500">Working…</p>}
      {error && <div className="rounded border-l-4 border-rose-500 bg-rose-50 dark:bg-rose-900/20 p-3 text-sm">{error}</div>}
      {committed != null && <div className="rounded border-l-4 border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 p-3 text-sm">Saved budget id {committed}.</div>}

      {preview && (
        <>
          <p className="text-xs text-slate-500">
            Detected format: <strong>{preview.format === 'rich' ? 'rich AUC-style' : 'flat normalized'}</strong> · {preview.rows.length} lines.
            High season monthly total: <strong>{fmt(preview.totals.high)}</strong> · Low: <strong>{fmt(preview.totals.low)}</strong>.
          </p>
          {preview.warnings.length > 0 && (
            <div className="rounded border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs">
              <strong>{preview.warnings.length} warning{preview.warnings.length === 1 ? '' : 's'}:</strong>
              <ul className="list-disc pl-5 mt-1 max-h-32 overflow-y-auto">
                {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          )}
          <PreviewGrid rows={preview.rows} />
          <div className="flex gap-2">
            <button onClick={() => commit(false)} disabled={pending || !projectId}
                    className="px-3 py-2 rounded border border-slate-300 dark:border-slate-700 text-sm">Save as Draft</button>
            <button onClick={() => commit(true)} disabled={pending || !projectId}
                    className="px-3 py-2 rounded bg-amber-600 text-white text-sm">Publish</button>
          </div>
        </>
      )}
    </div>
  );
}
function fmt(n: number): string { return new Intl.NumberFormat('en-EG', { maximumFractionDigits: 0 }).format(n); }
