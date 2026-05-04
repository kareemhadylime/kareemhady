'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Search, Plus, Upload, Archive } from 'lucide-react';
import type { FmplusCatalogItem } from '@/lib/fmplus/budget/schema';
import { archiveItemAction } from '../actions';
import { BulkImportModal } from './bulk-import-modal';
import { AddItemModal } from './add-item-modal';

interface Props {
  items: FmplusCatalogItem[];
  selectedId: number | null;
  canEdit: boolean;
  currentSearch: { q: string; service: string; category: string; active: string };
}

export function CatalogTable({ items, selectedId, canEdit, currentSearch }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [bulkOpen, setBulkOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    if (value) params.set(key, value); else params.delete(key);
    startTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  };

  const selectRow = (id: number) => {
    const params = new URLSearchParams(searchParams);
    if (selectedId === id) params.delete('selected'); else params.set('selected', String(id));
    startTransition(() => {
      router.replace(`?${params.toString()}`, { scroll: false });
    });
  };

  const onArchive = async (id: number) => {
    if (!confirm('Archive this catalog item? It will no longer appear in pickers but existing budget lines keep their reference.')) return;
    await archiveItemAction(id);
  };

  return (
    <div className="flex flex-col relative">
      {/* Toolbar */}
      <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 p-3 flex flex-wrap items-center gap-2">
        <label className="relative">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
          <input
            type="search"
            placeholder="Search code, name, ..."
            defaultValue={currentSearch.q}
            onBlur={(e) => updateParam('q', e.currentTarget.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') updateParam('q', e.currentTarget.value); }}
            className="pl-7 pr-3 py-1.5 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded w-56"
          />
        </label>
        <select
          value={currentSearch.service}
          onChange={(e) => updateParam('service', e.currentTarget.value)}
          className="text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5"
        >
          <option value="">All services</option>
          <option value="hk">HK</option>
          <option value="mep">MEP</option>
          <option value="landscape">Landscape</option>
          <option value="security">Security</option>
          <option value="pest_ctrl">Pest Ctrl</option>
          <option value="waste_mgmt">Waste</option>
          <option value="back_office">Back Office</option>
        </select>
        <select
          value={currentSearch.category}
          onChange={(e) => updateParam('category', e.currentTarget.value)}
          className="text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5"
        >
          <option value="">All categories</option>
          <option value="manning">Manning</option>
          <option value="ppe">PPE</option>
          <option value="tools">Tools</option>
          <option value="consumables">Consumables</option>
          <option value="transport">Transport</option>
          <option value="it">IT</option>
          <option value="governmental">Governmental</option>
          <option value="other">Other</option>
        </select>
        <select
          value={currentSearch.active}
          onChange={(e) => updateParam('active', e.currentTarget.value)}
          className="text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5"
        >
          <option value="">Active only</option>
          <option value="all">Include archived</option>
        </select>
        <span className="ml-auto flex items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400">{items.length} items</span>
          {canEdit && (
            <>
              <button
                type="button"
                onClick={() => setBulkOpen(true)}
                className="text-xs px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-900 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1"
              >
                <Upload size={13} /> Bulk import
              </button>
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded font-semibold flex items-center gap-1 hover:bg-indigo-700"
              >
                <Plus size={13} /> Add item
              </button>
            </>
          )}
        </span>
      </div>

      {/* Table */}
      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center min-h-[40vh] text-sm text-slate-500 dark:text-slate-400">
          No catalog items match current filters.
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 sticky top-[57px]">
              <tr>
                <th className="px-2 py-2 text-left w-6"></th>
                <th className="px-2 py-2 text-left">Code</th>
                <th className="px-2 py-2 text-left">Name</th>
                <th className="px-2 py-2 text-center w-20">Unit</th>
                <th className="px-2 py-2 text-right w-28">Default</th>
                <th className="px-2 py-2 text-left w-32">Services</th>
                <th className="px-2 py-2 text-left">Tags</th>
                {canEdit && <th className="px-2 py-2 w-16"></th>}
              </tr>
            </thead>
            <tbody className="text-slate-900 dark:text-slate-100">
              {items.map((it) => {
                const isSelected = selectedId === it.id;
                return (
                  <tr
                    key={it.id}
                    onClick={() => it.id != null && selectRow(it.id)}
                    className={`border-b border-slate-200 dark:border-slate-700 cursor-pointer ${
                      isSelected ? 'bg-blue-500/10 ring-1 ring-accent' : 'hover:bg-slate-100 dark:hover:bg-slate-700/40'
                    } ${!it.is_active ? 'opacity-50' : ''}`}
                  >
                    <td className="px-2 py-2 text-slate-500 dark:text-slate-400">{it.is_active ? '●' : '○'}</td>
                    <td className="px-2 py-2 font-mono text-[11px]">{it.code}</td>
                    <td className="px-2 py-2">
                      <div>{it.name_en}</div>
                      {it.name_ar && <div className="text-[10px] text-slate-500 dark:text-slate-400">{it.name_ar}</div>}
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className="text-[10px] px-2 py-0.5 bg-slate-50 dark:bg-slate-800 rounded text-slate-500 dark:text-slate-400">{it.unit}</span>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums">{Number(it.default_price).toLocaleString()}</td>
                    <td className="px-2 py-2 text-[11px] text-slate-500 dark:text-slate-400">
                      {it.service_lines.length === 7 ? 'all' : it.service_lines.join(', ')}
                    </td>
                    <td className="px-2 py-2 text-[10px] text-slate-500 dark:text-slate-400">{it.tags.join(', ')}</td>
                    {canEdit && (
                      <td className="px-2 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                        {isSelected ? (
                          <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">SELECTED</span>
                        ) : (
                          <button
                            onClick={() => it.id != null && onArchive(it.id)}
                            className="text-slate-500 dark:text-slate-400 hover:text-red-500 text-xs"
                            title="Archive"
                          >
                            <Archive size={12} />
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {isPending && (
        <div className="absolute top-1 right-1 text-[10px] text-slate-500 dark:text-slate-400">…</div>
      )}
      <BulkImportModal open={bulkOpen} onClose={() => setBulkOpen(false)} />
      <AddItemModal open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
