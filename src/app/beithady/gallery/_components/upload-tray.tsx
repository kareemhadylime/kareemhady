'use client';
import { useState, useEffect } from 'react';
import { Upload, ChevronUp, ChevronDown, X, RotateCw, Loader2, CheckCircle2, AlertTriangle, FileVideo } from 'lucide-react';
import { useGallery, type UploadJob } from './gallery-provider';

const AUTO_COLLAPSE_MS = 30_000;

function albumLabel(j: UploadJob): string {
  if (j.listingId) return j.listingId;
  if (j.building) return `${j.building} · general`;
  return 'library root';
}

export function UploadTray() {
  const { jobs, cancelJob, retryJob, clearFinished } = useGallery();
  const [expanded, setExpanded] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);

  const total = jobs.length;
  const inFlight = jobs.filter(j => j.status === 'uploading').length;
  const compressing = jobs.filter(j => j.status === 'compressing').length;
  const queued = jobs.filter(j => j.status === 'queued').length;
  const errors = jobs.filter(j => j.status === 'error').length;
  const active = inFlight + queued + compressing;
  const allDone = total > 0 && active === 0;

  useEffect(() => {
    if (!allDone || hasInteracted) return;
    const t = setTimeout(() => setExpanded(false), AUTO_COLLAPSE_MS);
    return () => clearTimeout(t);
  }, [allDone, hasInteracted]);

  if (total === 0) return null;

  const groups = new Map<string, UploadJob[]>();
  for (const j of jobs) {
    const key = `${j.building || ''}|${j.listingId || ''}`;
    const arr = groups.get(key) || [];
    arr.push(j);
    groups.set(key, arr);
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      {!expanded ? (
        <button
          onClick={() => { setExpanded(true); setHasInteracted(true); }}
          className="ix-card px-3 py-2 shadow-lg flex items-center gap-2 hover:shadow-xl transition"
        >
          <Upload size={14} className={active > 0 ? 'animate-pulse text-blue-500' : 'text-slate-400'} />
          <span className="text-xs font-semibold tabular-nums">
            {active > 0
              ? `↑ ${active} ${active === 1 ? 'upload' : 'uploads'}`
              : `${total} done`}
            {errors > 0 && <span className="text-rose-500"> · {errors} err</span>}
          </span>
          <ChevronUp size={12} className="text-slate-400" />
        </button>
      ) : (
        <div className="ix-card shadow-xl w-96 max-h-[60vh] flex flex-col">
          <header className="flex items-center justify-between gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center gap-2">
              <Upload size={14} className={active > 0 ? 'text-blue-500 animate-pulse' : 'text-slate-400'} />
              <span className="text-xs font-semibold">
                {active > 0
                  ? compressing > 0
                    ? `Processing ${active} of ${total}`
                    : `Uploading ${active} of ${total}`
                  : `${total} ${total === 1 ? 'job' : 'jobs'}`}
              </span>
              {errors > 0 && <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">{errors} error{errors === 1 ? '' : 's'}</span>}
            </div>
            <div className="flex items-center gap-1">
              {(jobs.some(j => j.status === 'done' || j.status === 'error')) && (
                <button onClick={() => { clearFinished(); setHasInteracted(true); }} className="text-[10px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-1.5 py-0.5">
                  Clear finished
                </button>
              )}
              <button onClick={() => { setExpanded(false); setHasInteracted(true); }} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                <ChevronDown size={14} />
              </button>
            </div>
          </header>
          <div className="overflow-y-auto flex-1 divide-y divide-slate-100 dark:divide-slate-800">
            {Array.from(groups.entries()).map(([key, list]) => {
              const sample = list[0];
              return (
                <div key={key} className="p-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold mb-1">
                    → {albumLabel(sample)} · {list.length} {list.length === 1 ? 'file' : 'files'}
                  </p>
                  <div className="space-y-0.5">
                    {list.map(j => (
                      <div key={j.id} className="flex items-center gap-2 text-xs py-0.5">
                        <span className="flex-1 truncate" title={j.file.name}>
                          {j.file.name}
                          {j.status === 'compressing' && (
                            <span className="ml-1 text-[10px] text-slate-500">
                              · compressing {j.compressPercent ?? 0}%
                            </span>
                          )}
                        </span>
                        <span className="text-slate-400 tabular-nums text-[10px] w-14 text-right">
                          {(j.file.size / 1024 / 1024).toFixed(1)} MB
                        </span>
                        <span className="w-6 text-right">
                          {j.status === 'queued' && <span className="text-slate-400 text-[10px]">…</span>}
                          {j.status === 'compressing' && <FileVideo size={11} className="inline text-amber-500 animate-pulse" />}
                          {j.status === 'uploading' && <Loader2 size={11} className="inline animate-spin text-blue-500" />}
                          {j.status === 'done' && <CheckCircle2 size={11} className="text-emerald-600 inline" />}
                          {j.status === 'error' && <AlertTriangle size={11} className="text-rose-600 inline" />}
                        </span>
                        {j.status === 'queued' && (
                          <button onClick={() => cancelJob(j.id)} className="text-slate-400 hover:text-rose-600 p-0.5" title="Cancel">
                            <X size={10} />
                          </button>
                        )}
                        {j.status === 'error' && (
                          <button onClick={() => retryJob(j.id)} className="text-slate-400 hover:text-blue-600 p-0.5" title={j.error || 'Retry'}>
                            <RotateCw size={10} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
