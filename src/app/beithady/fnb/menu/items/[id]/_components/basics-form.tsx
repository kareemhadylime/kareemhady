'use client';
import { useState } from 'react';
import type { Item, Category } from '@/lib/beithady/fnb/types';

export function BasicsForm({
  item, categories, onSaved,
}: {
  item: Item;
  categories: Category[];
  onSaved: (item: Item) => void;
}) {
  const [form, setForm] = useState({
    name_en: item.name_en,
    description_en: item.description_en ?? '',
    category_id: item.category_id,
    price_usd: item.price_usd,
    cost_usd: (item.cost_usd ?? '') as number | string,
    enabled: item.enabled,
    sort_order: item.sort_order,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true); setErr(null);
    const res = await fetch(`/api/beithady/fnb/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        price_usd: Number(form.price_usd),
        cost_usd: form.cost_usd === '' ? null : Number(form.cost_usd),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setErr((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
      return;
    }
    onSaved((await res.json()).item);
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <label className="col-span-2">
        <span className="block text-xs font-medium mb-1">Name (English)</span>
        <input
          value={form.name_en}
          onChange={e => setForm(f => ({ ...f, name_en: e.target.value }))}
          className="ix-input"
        />
      </label>
      <label className="col-span-2">
        <span className="block text-xs font-medium mb-1">Description (English)</span>
        <textarea
          value={form.description_en}
          onChange={e => setForm(f => ({ ...f, description_en: e.target.value }))}
          className="ix-input min-h-[80px]"
        />
      </label>
      <label>
        <span className="block text-xs font-medium mb-1">Category</span>
        <select
          value={form.category_id}
          onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
          className="ix-input"
        >
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name_en}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="block text-xs font-medium mb-1">Sort order</span>
        <input
          type="number"
          value={form.sort_order}
          onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))}
          className="ix-input"
        />
      </label>
      <label>
        <span className="block text-xs font-medium mb-1">
          Price (USD, incl. VAT + service)
        </span>
        <input
          type="number" step="0.01" min="0"
          value={form.price_usd}
          onChange={e => setForm(f => ({ ...f, price_usd: Number(e.target.value) }))}
          className="ix-input"
        />
      </label>
      <label>
        <span className="block text-xs font-medium mb-1">
          Cost (USD, optional — for margin reports)
        </span>
        <input
          type="number" step="0.01" min="0"
          value={form.cost_usd}
          onChange={e => setForm(f => ({ ...f, cost_usd: e.target.value }))}
          placeholder="—"
          className="ix-input"
        />
      </label>
      <label className="col-span-2 flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))}
        />
        <span className="text-sm">Enabled (visible on guest menu)</span>
      </label>
      {err && <div className="col-span-2 text-sm text-red-600">{err}</div>}
      <div className="col-span-2 flex gap-2">
        <button
          onClick={save}
          disabled={saving}
          className="ix-btn-primary px-4 py-2 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
