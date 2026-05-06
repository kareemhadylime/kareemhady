'use client';
import { useState } from 'react';
import type { Item, Category } from '@/lib/beithady/fnb/types';

const LANGS: Array<{ key: 'en' | 'ar' | 'ru' | 'fr'; label: string }> = [
  { key: 'en', label: 'English' },
  { key: 'ar', label: 'العربية' },
  { key: 'ru', label: 'Русский' },
  { key: 'fr', label: 'Français' },
];

export function BasicsForm({
  item: initialItem, categories, onSaved,
}: {
  item: Item;
  categories: Category[];
  onSaved: (item: Item) => void;
}) {
  const [item, setItem] = useState(initialItem);
  const [activeLang, setActiveLang] = useState<'en'|'ar'|'ru'|'fr'>('en');
  const [translating, setTranslating] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const flags = (item.ai_translation_flags ?? {}) as Record<string, boolean>;

  function isAiDrafted(field: 'name' | 'description', lang: 'ar'|'ru'|'fr') {
    return flags[`${field}_${lang}`] === true;
  }

  async function translate(field: 'name' | 'description', lang: 'ar'|'ru'|'fr') {
    setTranslating(`${field}_${lang}`);
    const res = await fetch(`/api/beithady/fnb/items/${item.id}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ field, target_lang: lang }),
    });
    setTranslating(null);
    if (res.ok) {
      const { item: updated } = await res.json();
      setItem(updated);
    }
  }

  async function approve(field: 'name' | 'description', lang: 'ar'|'ru'|'fr') {
    const newFlags = { ...flags, [`${field}_${lang}`]: false };
    const res = await fetch(`/api/beithady/fnb/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ai_translation_flags: newFlags }),
    });
    if (res.ok) setItem((await res.json()).item);
  }

  async function saveAll() {
    setSaving(true);
    const payload: Record<string, unknown> = {
      category_id: item.category_id,
      price_usd: item.price_usd,
      cost_usd: item.cost_usd ?? null,
      enabled: item.enabled,
      sort_order: item.sort_order,
    };
    for (const l of LANGS) {
      payload[`name_${l.key}`] = (item as Record<string, unknown>)[`name_${l.key}`] ?? null;
      payload[`description_${l.key}`] = (item as Record<string, unknown>)[`description_${l.key}`] ?? null;
    }
    const res = await fetch(`/api/beithady/fnb/items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setSaving(false);
    if (res.ok) {
      const { item: updated } = await res.json();
      setItem(updated);
      onSaved(updated);
    }
  }

  return (
    <div>
      <nav className="flex gap-1 mb-4 border-b">
        {LANGS.map(l => (
          <button
            key={l.key}
            onClick={() => setActiveLang(l.key)}
            className={`px-3 py-1.5 text-sm ${activeLang === l.key ? 'border-b-2 border-rose-600 font-semibold' : 'text-slate-500'}`}
            dir={l.key === 'ar' ? 'rtl' : 'ltr'}
          >{l.label}</button>
        ))}
      </nav>

      {LANGS.filter(l => l.key === activeLang).map(l => (
        <div key={l.key} dir={l.key === 'ar' ? 'rtl' : 'ltr'} className="space-y-3">
          <label className="block">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium">Name ({l.label})</span>
              {l.key !== 'en' && (
                <span className="flex items-center gap-1">
                  {isAiDrafted('name', l.key) && (
                    <>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">[AI]</span>
                      <button onClick={() => approve('name', l.key as 'ar'|'ru'|'fr')} className="text-xs underline text-emerald-600">Approve</button>
                    </>
                  )}
                  <button
                    onClick={() => translate('name', l.key as 'ar'|'ru'|'fr')}
                    disabled={translating === `name_${l.key}`}
                    className="text-xs underline text-rose-600 disabled:opacity-50"
                  >
                    {translating === `name_${l.key}` ? '…' : '✨ Translate from English'}
                  </button>
                </span>
              )}
            </div>
            <input
              value={(item as Record<string, unknown>)[`name_${l.key}`] as string ?? ''}
              onChange={e => setItem({ ...item, [`name_${l.key}`]: e.target.value } as Item)}
              className="ix-input"
            />
          </label>
          <label className="block">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium">Description ({l.label})</span>
              {l.key !== 'en' && (
                <span className="flex items-center gap-1">
                  {isAiDrafted('description', l.key) && (
                    <>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">[AI]</span>
                      <button onClick={() => approve('description', l.key as 'ar'|'ru'|'fr')} className="text-xs underline text-emerald-600">Approve</button>
                    </>
                  )}
                  <button
                    onClick={() => translate('description', l.key as 'ar'|'ru'|'fr')}
                    disabled={translating === `description_${l.key}`}
                    className="text-xs underline text-rose-600 disabled:opacity-50"
                  >
                    {translating === `description_${l.key}` ? '…' : '✨ Translate from English'}
                  </button>
                </span>
              )}
            </div>
            <textarea
              value={(item as Record<string, unknown>)[`description_${l.key}`] as string ?? ''}
              onChange={e => setItem({ ...item, [`description_${l.key}`]: e.target.value } as Item)}
              rows={3}
              className="ix-input"
            />
          </label>
        </div>
      ))}

      <div className="grid grid-cols-2 gap-4 mt-6 pt-4 border-t">
        <label>
          <span className="block text-xs font-medium mb-1">Category</span>
          <select
            value={item.category_id}
            onChange={e => setItem({ ...item, category_id: e.target.value })}
            className="ix-input"
          >
            {categories.map(c => <option key={c.id} value={c.id}>{c.name_en}</option>)}
          </select>
        </label>
        <label>
          <span className="block text-xs font-medium mb-1">Sort order</span>
          <input
            type="number"
            value={item.sort_order}
            onChange={e => setItem({ ...item, sort_order: Number(e.target.value) })}
            className="ix-input"
          />
        </label>
        <label>
          <span className="block text-xs font-medium mb-1">Price (USD)</span>
          <input
            type="number" step="0.01" min="0"
            value={item.price_usd}
            onChange={e => setItem({ ...item, price_usd: Number(e.target.value) })}
            className="ix-input"
          />
        </label>
        <label>
          <span className="block text-xs font-medium mb-1">Cost (USD, optional)</span>
          <input
            type="number" step="0.01" min="0"
            value={item.cost_usd ?? ''}
            onChange={e => setItem({ ...item, cost_usd: e.target.value === '' ? null : Number(e.target.value) } as Item)}
            className="ix-input"
          />
        </label>
        <label className="col-span-2 flex items-center gap-2">
          <input
            type="checkbox"
            checked={item.enabled}
            onChange={e => setItem({ ...item, enabled: e.target.checked })}
          />
          <span className="text-sm">Enabled</span>
        </label>
      </div>

      <button
        onClick={saveAll}
        disabled={saving}
        className="ix-btn-primary px-4 py-2 mt-4 disabled:opacity-50"
      >{saving ? 'Saving…' : 'Save'}</button>
    </div>
  );
}
