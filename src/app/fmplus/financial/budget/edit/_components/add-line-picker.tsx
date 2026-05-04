'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Search, X, Plus, FileText } from 'lucide-react';
import type { FmplusCatalogItem } from '@/lib/fmplus/budget/schema';
import type { ServiceLine, Category } from '@/lib/fmplus/budget/types';
import { addLineAction } from '../actions';

// Server action wrapper — re-imports to keep this file client-only
async function fetchCatalogItems(opts: { q?: string; service_line?: string; category?: string }): Promise<FmplusCatalogItem[]> {
  const params = new URLSearchParams();
  if (opts.q) params.set('q', opts.q);
  if (opts.service_line) params.set('service', opts.service_line);
  if (opts.category) params.set('category', opts.category);
  const res = await fetch(`/api/fmplus/budget/catalog-search?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Catalog search failed');
  return await res.json();
}

interface Props {
  open: boolean;
  onClose: () => void;
  contractId: number;
  yearId: number;
  serviceLine: ServiceLine;
  category: Category;
}

export function AddLinePicker({ open, onClose, contractId, yearId, serviceLine, category }: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<'catalog' | 'freetext'>('catalog');
  const [items, setItems] = useState<FmplusCatalogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [filterService, setFilterService] = useState<ServiceLine | ''>(serviceLine);
  const [filterCategory, setFilterCategory] = useState<Category | ''>(category);

  // Free-text form state
  const [ftCode, setFtCode] = useState('');
  const [ftLabelEn, setFtLabelEn] = useState('');
  const [ftLabelAr, setFtLabelAr] = useState('');
  const [ftQty, setFtQty] = useState('1');
  const [ftUnitCost, setFtUnitCost] = useState('0');

  const [isPending, startTransition] = useTransition();

  // Reload catalog when modal opens or filters change
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetchCatalogItems({
      q: q || undefined,
      service_line: filterService || undefined,
      category: filterCategory || undefined,
    })
      .then(setItems)
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [open, q, filterService, filterCategory]);

  if (!open) return null;

  const reset = () => {
    setTab('catalog');
    setQ('');
    setFilterService(serviceLine);
    setFilterCategory(category);
    setFtCode('');
    setFtLabelEn('');
    setFtLabelAr('');
    setFtQty('1');
    setFtUnitCost('0');
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const addCatalogItem = (item: FmplusCatalogItem) => {
    if (!item.id) return;
    startTransition(async () => {
      try {
        await addLineAction({
          contract_id: contractId,
          year_id: yearId,
          service_line: serviceLine,
          category,
          catalog_item_id: item.id,
          line_code: item.code,
          label_en: item.name_en,
          label_ar: item.name_ar ?? null,
          season: 'high',
          qty: 1,
          // unit_cost resolved server-side via override-first lookup
        });
        router.refresh();
        handleClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const addFreeText = () => {
    if (!ftCode || !ftLabelEn) {
      setError('Code and label_en are required for free-text lines.');
      return;
    }
    startTransition(async () => {
      try {
        await addLineAction({
          contract_id: contractId,
          year_id: yearId,
          service_line: serviceLine,
          category,
          catalog_item_id: null,
          line_code: ftCode,
          label_en: ftLabelEn,
          label_ar: ftLabelAr || null,
          season: 'high',
          qty: Number(ftQty) || 0,
          unit_cost: Number(ftUnitCost) || 0,
        });
        router.refresh();
        handleClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-bg-primary border border-border rounded-lg max-w-2xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-bg-tertiary">
          <strong className="text-sm text-text-primary">Add line — {category} · {serviceLine.toUpperCase()}</strong>
          <button onClick={handleClose} className="text-text-secondary hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-border bg-bg-secondary px-3 flex gap-0">
          <button onClick={() => setTab('catalog')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 ${
              tab === 'catalog' ? 'border-accent text-text-primary' : 'border-transparent text-text-secondary'
            }`}>
            Catalog picker
          </button>
          <button onClick={() => setTab('freetext')}
            className={`px-3 py-2 text-xs font-semibold border-b-2 flex items-center gap-1 ${
              tab === 'freetext' ? 'border-accent text-text-primary' : 'border-transparent text-text-secondary'
            }`}>
            <FileText size={11} /> Free-text line
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {tab === 'catalog' ? (
            <div className="space-y-3">
              <label className="relative block">
                <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-text-secondary" />
                <input type="search" placeholder="Search code, name, مشرف, broom..."
                  value={q} onChange={e => setQ(e.currentTarget.value)}
                  className="pl-7 pr-3 py-1.5 text-sm bg-bg-secondary border border-border rounded w-full" />
              </label>
              <div className="flex gap-1.5 text-[10px] flex-wrap">
                <span className="px-2 py-1 bg-blue-500/15 text-accent border border-accent/40 rounded-full">
                  Service: {filterService || 'any'}
                </span>
                <span className="px-2 py-1 bg-bg-secondary text-text-secondary border border-border rounded-full">
                  Category: {filterCategory || 'any'}
                </span>
                <button type="button"
                  onClick={() => { setFilterService(''); setFilterCategory(''); }}
                  className="px-2 py-1 text-text-secondary hover:text-text-primary underline">
                  clear filters
                </button>
              </div>
              {loading && <p className="text-xs text-text-secondary">Searching…</p>}
              {error && <p className="text-xs text-red-400">{error}</p>}
              {!loading && items.length === 0 && (
                <p className="text-xs text-text-secondary italic">No matches. Try clearing filters or use the Free-text tab.</p>
              )}
              {items.length > 0 && (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-text-secondary uppercase border-b border-border text-left">
                      <th className="px-2 py-1.5">Code</th>
                      <th className="px-2 py-1.5">Name</th>
                      <th className="px-2 py-1.5 text-center w-16">Unit</th>
                      <th className="px-2 py-1.5 text-right w-20">Default</th>
                      <th className="px-2 py-1.5 w-12"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map(it => (
                      <tr key={it.id} className="border-b border-border hover:bg-bg-tertiary/40">
                        <td className="px-2 py-1.5 font-mono text-[10px]">{it.code}</td>
                        <td className="px-2 py-1.5">
                          <div>{it.name_en}</div>
                          {it.name_ar && <div className="text-[10px] text-text-secondary">{it.name_ar}</div>}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <span className="text-[10px] px-1.5 py-0.5 bg-bg-secondary rounded text-text-secondary">{it.unit}</span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{Number(it.default_price).toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-center">
                          <button type="button" onClick={() => addCatalogItem(it)} disabled={isPending}
                            className="text-[10px] px-2 py-1 bg-accent text-white rounded font-semibold disabled:opacity-50">
                            + Add
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : (
            <div className="space-y-3 max-w-md">
              {error && <p className="text-xs text-red-400">{error}</p>}
              <label className="block">
                <span className="text-xs text-text-secondary">Line code <span className="text-red-400">*</span></span>
                <input value={ftCode} onChange={e => setFtCode(e.currentTarget.value)}
                  placeholder="e.g. custom_role_1"
                  className="w-full text-sm bg-bg-secondary border border-border rounded px-2 py-1.5 mt-1 font-mono" />
              </label>
              <label className="block">
                <span className="text-xs text-text-secondary">Label (English) <span className="text-red-400">*</span></span>
                <input value={ftLabelEn} onChange={e => setFtLabelEn(e.currentTarget.value)}
                  className="w-full text-sm bg-bg-secondary border border-border rounded px-2 py-1.5 mt-1" />
              </label>
              <label className="block">
                <span className="text-xs text-text-secondary">Label (Arabic, optional)</span>
                <input value={ftLabelAr} onChange={e => setFtLabelAr(e.currentTarget.value)}
                  className="w-full text-sm bg-bg-secondary border border-border rounded px-2 py-1.5 mt-1" dir="rtl" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-text-secondary">Qty / HC</span>
                  <input type="number" min="0" step="0.01"
                    value={ftQty} onChange={e => setFtQty(e.currentTarget.value)}
                    className="w-full text-sm bg-bg-secondary border border-border rounded px-2 py-1.5 mt-1 text-right tabular-nums" />
                </label>
                <label className="block">
                  <span className="text-xs text-text-secondary">Unit cost (EGP / mo)</span>
                  <input type="number" min="0" step="0.01"
                    value={ftUnitCost} onChange={e => setFtUnitCost(e.currentTarget.value)}
                    className="w-full text-sm bg-bg-secondary border border-border rounded px-2 py-1.5 mt-1 text-right tabular-nums" />
                </label>
              </div>
              <button type="button" onClick={addFreeText} disabled={isPending || !ftCode || !ftLabelEn}
                className="w-full text-xs px-3 py-1.5 bg-accent text-white rounded font-semibold disabled:opacity-50 flex items-center justify-center gap-1">
                <Plus size={12} /> Add free-text line
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-bg-tertiary text-[11px] text-text-secondary flex justify-between items-center">
          <span>Adds to year_id={yearId} · {serviceLine}/{category}</span>
          <button type="button" onClick={handleClose}
            className="text-xs px-3 py-1 text-text-secondary border border-border rounded hover:bg-bg-secondary">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
