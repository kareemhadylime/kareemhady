'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ImportDropzone() {
  const router = useRouter();
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);

  async function upload(files: FileList) {
    setBusy(true);
    const form = new FormData();
    for (const f of Array.from(files)) form.append('files', f);
    const r = await fetch('/api/personal/stocks/upload', { method: 'POST', body: form });
    setBusy(false);
    if (!r.ok) { setResults([{ status: 'error', message: 'upload failed' }]); return; }
    const j = await r.json();
    setResults(j.results);
    router.refresh();
  }

  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault(); setDragging(false);
          if (e.dataTransfer.files?.length) void upload(e.dataTransfer.files);
        }}
        className={`ix-card p-8 text-center border-2 border-dashed ${dragging ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-300'}`}
      >
        <div className="text-sm">Drop AOLB <code>.xls</code> files here</div>
        <div className="text-xs text-slate-400 mt-1">or</div>
        <label className="inline-block mt-2 px-3 py-1.5 text-sm bg-emerald-600 text-white rounded cursor-pointer hover:bg-emerald-700">
          Choose files
          <input
            type="file" multiple accept=".xls,.xml"
            className="hidden"
            onChange={(e) => e.target.files && void upload(e.target.files)}
          />
        </label>
        {busy && <div className="text-xs text-slate-500 mt-3">Uploading…</div>}
      </div>
      {results && (
        <div className="ix-card mt-3 p-3 text-xs">
          <div className="font-semibold mb-2">Results</div>
          <ul className="space-y-1">
            {results.map((r, i) => (
              <li key={i} className={r.status === 'ok' ? 'text-emerald-700' : r.status === 'duplicate' ? 'text-slate-500' : 'text-rose-700'}>
                {r.filename}: {r.status} {r.message ? `(${r.message})` : ''}
                {r.parsed && <span className="text-slate-400"> · trades:{r.parsed.trades} cash:{r.parsed.cash} div:{r.parsed.dividends} fees:{r.parsed.fees} int:{r.parsed.interest}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
