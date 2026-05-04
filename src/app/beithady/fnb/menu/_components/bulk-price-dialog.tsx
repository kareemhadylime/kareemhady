'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Category } from '@/lib/beithady/fnb/types';

export function BulkPriceDialog({ categories }: { categories: Category[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [delta, setDelta] = useState(0);
  const [busy, setBusy] = useState(false);

  async function apply() {
    const scope = categoryId
      ? categories.find(c => c.id === categoryId)?.name_en
      : 'ALL';
    if (!confirm(`Apply ${delta >= 0 ? '+' : ''}${delta}% to ${scope} items?`)) return;
    setBusy(true);
    const res = await fetch('/api/beithady/fnb/items/bulk-price-update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category_id: categoryId || null,
        item_ids: [],
        delta_pct: delta,
      }),
    });
    setBusy(false);
    if (res.ok) {
      const { updated } = await res.json();
      alert(`Updated ${updated} items.`);
      setOpen(false);
      setDelta(0);
      router.refresh();
    } else {
      alert('Failed.');
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ix-btn-secondary px-3 py-2 text-sm w-full"
      >Bulk price update</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="ix-card p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4">Bulk price update</h3>
            <label className="block mb-3">
              <span className="block text-xs font-medium mb-1">Scope</span>
              <select
                value={categoryId}
                onChange={e => setCategoryId(e.target.value)}
                className="ix-input"
              >
                <option value="">All items</option>
                {categories.map(c => (
                  <option key={c.id} value={c.id}>{c.name_en}</option>
                ))}
              </select>
            </label>
            <label className="block mb-3">
              <span className="block text-xs font-medium mb-1">
                Percentage change (-50 to +100)
              </span>
              <input
                type="number" min="-50" max="100" step="1"
                value={delta}
                onChange={e => setDelta(Number(e.target.value))}
                className="ix-input"
              />
            </label>
            <p className="text-xs text-slate-500 mb-4">
              Each price is multiplied by 1 + delta/100, rounded to cents.
              Logged to audit per item.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setOpen(false)}
                className="ix-btn-secondary px-3 py-2 text-sm"
              >Cancel</button>
              <button
                onClick={apply}
                disabled={busy}
                className="ix-btn-primary px-4 py-2 text-sm disabled:opacity-50"
              >{busy ? 'Applying…' : 'Apply'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
