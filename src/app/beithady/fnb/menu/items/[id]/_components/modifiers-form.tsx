'use client';
import { useEffect, useState } from 'react';
import type { Modifier } from '@/lib/beithady/fnb/types';

export function ModifiersForm({ itemId }: { itemId: string }) {
  const [list, setList] = useState<Modifier[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({
    name_en: '', price_delta_usd: 0, sort_order: 0,
  });

  async function reload() {
    const res = await fetch(`/api/beithady/fnb/items/${itemId}/modifiers`);
    setList((await res.json()).modifiers);
    setLoading(false);
  }
  useEffect(() => { reload(); }, [itemId]);

  async function add() {
    if (!draft.name_en) return;
    await fetch(`/api/beithady/fnb/items/${itemId}/modifiers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(draft),
    });
    setDraft({ name_en: '', price_delta_usd: 0, sort_order: 0 });
    reload();
  }

  async function remove(id: string) {
    if (!confirm('Delete this modifier?')) return;
    await fetch(`/api/beithady/fnb/items/${itemId}/modifiers/${id}`, {
      method: 'DELETE',
    });
    reload();
  }

  if (loading) return <div className="text-slate-500 text-sm">Loading…</div>;
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-slate-200 dark:divide-slate-700">
        {list.map(m => (
          <li key={m.id} className="flex items-center justify-between py-2">
            <span className="text-sm">
              {m.name_en}{' '}
              <span className="text-xs text-slate-400">
                +${m.price_delta_usd.toFixed(2)}
              </span>
            </span>
            <button
              onClick={() => remove(m.id!)}
              className="text-xs text-red-600 hover:underline"
            >Remove</button>
          </li>
        ))}
        {list.length === 0 && (
          <li className="text-sm text-slate-400 py-2">No modifiers yet.</li>
        )}
      </ul>
      <div className="grid grid-cols-3 gap-2 pt-3 border-t">
        <input
          placeholder="Add modifier name (e.g., Add Grilled Chicken)"
          value={draft.name_en}
          onChange={e => setDraft(d => ({ ...d, name_en: e.target.value }))}
          className="ix-input col-span-2"
        />
        <div className="flex gap-1">
          <input
            type="number" step="0.01" min="0"
            placeholder="$"
            value={draft.price_delta_usd}
            onChange={e => setDraft(d => ({
              ...d, price_delta_usd: Number(e.target.value),
            }))}
            className="ix-input flex-1"
          />
          <button onClick={add} className="ix-btn-primary px-3">Add</button>
        </div>
      </div>
    </div>
  );
}
