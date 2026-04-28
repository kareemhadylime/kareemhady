'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Bookmark, Save, Trash2, Share2, Lock } from 'lucide-react';
import { saveViewAction, deleteViewAction, type SavedView, type SavedViewFilters } from '../actions';

export function SavedViewsMenu({ initialViews }: { initialViews: SavedView[] }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'private' | 'shared'>('private');
  const [pending, startTransition] = useTransition();

  const applyView = (filters: SavedViewFilters) => {
    const next = new URLSearchParams();
    if (filters.buildings && filters.buildings.length > 0) next.set('buildings', filters.buildings.join(','));
    if (filters.channels && filters.channels.length > 0) next.set('channels', filters.channels.join(','));
    if (filters.status && filters.status !== 'all') next.set('status', filters.status);
    if (filters.risk && filters.risk !== 'all') next.set('risk', filters.risk);
    if (filters.q) next.set('q', filters.q);
    if (filters.days) next.set('days', String(filters.days));
    router.push(`?${next.toString()}`);
    setOpen(false);
  };

  const captureCurrent = (): SavedViewFilters => {
    const out: SavedViewFilters = {};
    const b = sp?.get('buildings'); if (b) out.buildings = b.split(',').filter(Boolean);
    const c = sp?.get('channels'); if (c) out.channels = c.split(',').filter(Boolean);
    const s = sp?.get('status'); if (s && s !== 'all') out.status = s;
    const r = sp?.get('risk'); if (r && r !== 'all') out.risk = r;
    const q = sp?.get('q'); if (q) out.q = q;
    const d = sp?.get('days'); if (d) out.days = Number(d);
    return out;
  };

  const save = () => {
    if (!name.trim()) return;
    startTransition(async () => {
      const r = await saveViewAction({ name, scope, filters: captureCurrent() });
      if (r.ok) {
        setName('');
        setShowSaveForm(false);
        // Refresh page so updated list is fetched
        router.refresh();
      } else {
        alert(`Failed: ${r.error}`);
      }
    });
  };

  const remove = (id: string) => {
    if (!confirm('Delete this saved view?')) return;
    startTransition(async () => {
      const r = await deleteViewAction(id);
      if (r.ok) router.refresh();
      else alert(`Failed: ${r.error}`);
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="ix-btn-secondary !text-xs"
      >
        <Bookmark size={12} /> Views
        {initialViews.length > 0 && (
          <span className="ml-1 text-[10px] text-slate-400">({initialViews.length})</span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute right-0 mt-1 w-72 ix-card p-2 z-40 shadow-lg text-xs space-y-1">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 px-2">
              Saved views
            </div>
            {initialViews.length === 0 ? (
              <div className="px-2 py-3 text-slate-500 text-[11px]">
                No saved views yet. Filter the calendar, then save.
              </div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-0.5">
                {initialViews.map(v => (
                  <div key={v.id} className="flex items-center gap-1 hover:bg-slate-50 dark:hover:bg-slate-800 rounded px-2 py-1">
                    <button
                      type="button"
                      onClick={() => applyView(v.filters_json)}
                      className="flex-1 text-left text-[11px] truncate"
                    >
                      {v.scope === 'shared'
                        ? <Share2 size={10} className="inline mr-1 text-cyan-600" />
                        : <Lock size={10} className="inline mr-1 text-slate-400" />
                      }
                      {v.name}
                    </button>
                    {v.is_mine && (
                      <button
                        type="button"
                        onClick={() => remove(v.id)}
                        disabled={pending}
                        className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded"
                        aria-label="Delete"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="border-t border-slate-200 dark:border-slate-700 pt-2 mt-2">
              {showSaveForm ? (
                <div className="space-y-1.5 px-1">
                  <input
                    autoFocus
                    type="text"
                    placeholder="View name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="ix-input !text-xs !py-1 !px-2 w-full"
                    maxLength={80}
                  />
                  <div className="flex items-center gap-2 text-[10px]">
                    <label className="inline-flex items-center gap-1">
                      <input
                        type="radio"
                        checked={scope === 'private'}
                        onChange={() => setScope('private')}
                      /> Private
                    </label>
                    <label className="inline-flex items-center gap-1">
                      <input
                        type="radio"
                        checked={scope === 'shared'}
                        onChange={() => setScope('shared')}
                      /> Shared
                    </label>
                  </div>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={save}
                      disabled={pending || !name.trim()}
                      className="ix-btn-primary !text-xs flex-1"
                    >
                      <Save size={11} /> Save
                    </button>
                    <button
                      type="button"
                      onClick={() => { setShowSaveForm(false); setName(''); }}
                      className="ix-btn-secondary !text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowSaveForm(true)}
                  className="w-full px-2 py-1 text-[11px] text-left hover:bg-slate-50 dark:hover:bg-slate-800 rounded inline-flex items-center gap-1"
                >
                  <Save size={11} /> Save current filters as a view…
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
