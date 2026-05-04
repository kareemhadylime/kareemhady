'use client';
import { useEffect, useState } from 'react';
import type { Modifier } from '@/lib/beithady/fnb/types';

const LANGS: Array<{ key: 'en' | 'ar' | 'ru' | 'fr'; label: string }> = [
  { key: 'en', label: 'EN' },
  { key: 'ar', label: 'AR' },
  { key: 'ru', label: 'RU' },
  { key: 'fr', label: 'FR' },
];

export function ModifiersForm({ itemId }: { itemId: string }) {
  const [list, setList] = useState<Modifier[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState({
    name_en: '', price_delta_usd: 0, sort_order: 0,
  });
  const [activeLang, setActiveLang] = useState<Record<string, 'en'|'ar'|'ru'|'fr'>>({});
  const [translating, setTranslating] = useState<string | null>(null);

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

  async function translate(modId: string, lang: 'ar'|'ru'|'fr') {
    setTranslating(`${modId}_${lang}`);
    const res = await fetch(
      `/api/beithady/fnb/items/${itemId}/modifiers/${modId}/translate`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_lang: lang }),
      },
    );
    setTranslating(null);
    if (res.ok) {
      const { modifier } = await res.json();
      setList(l => l.map(m => m.id === modId ? modifier : m));
    }
  }

  async function saveName(modId: string, lang: 'en'|'ar'|'ru'|'fr', name: string) {
    const res = await fetch(
      `/api/beithady/fnb/items/${itemId}/modifiers/${modId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [`name_${lang}`]: name }),
      },
    );
    if (res.ok) {
      const { modifier } = await res.json();
      setList(l => l.map(m => m.id === modId ? modifier : m));
    }
  }

  async function approve(modId: string, lang: 'ar'|'ru'|'fr') {
    const m = list.find(x => x.id === modId); if (!m) return;
    const flags = (m.ai_translation_flags ?? {}) as Record<string, boolean>;
    const newFlags = { ...flags, [`name_${lang}`]: false };
    const res = await fetch(
      `/api/beithady/fnb/items/${itemId}/modifiers/${modId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ai_translation_flags: newFlags }),
      },
    );
    if (res.ok) {
      const { modifier } = await res.json();
      setList(l => l.map(mm => mm.id === modId ? modifier : mm));
    }
  }

  if (loading) return <div className="text-slate-500 text-sm">Loading…</div>;
  return (
    <div className="space-y-4">
      <ul className="divide-y divide-slate-200 dark:divide-slate-700">
        {list.map(m => {
          const lang = activeLang[m.id!] ?? 'en';
          const flags = (m.ai_translation_flags ?? {}) as Record<string, boolean>;
          const aiFlag = lang !== 'en' && flags[`name_${lang}`] === true;
          return (
            <li key={m.id} className="py-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {LANGS.map(l => (
                  <button
                    key={l.key}
                    onClick={() => setActiveLang(s => ({ ...s, [m.id!]: l.key }))}
                    className={`text-[10px] px-1.5 py-0.5 rounded ${lang === l.key ? 'bg-rose-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
                    dir={l.key === 'ar' ? 'rtl' : 'ltr'}
                  >{l.label}</button>
                ))}
                <span className="text-xs text-slate-400 mx-1">·</span>
                <span className="text-xs text-slate-500">+${m.price_delta_usd.toFixed(2)}</span>
                <button
                  onClick={() => remove(m.id!)}
                  className="ml-auto text-xs text-red-600 hover:underline"
                >Remove</button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={(m as Record<string, unknown>)[`name_${lang}`] as string ?? ''}
                  onChange={e => setList(l => l.map(mm => mm.id === m.id
                    ? ({ ...mm, [`name_${lang}`]: e.target.value } as Modifier)
                    : mm))}
                  onBlur={e => saveName(m.id!, lang, e.target.value)}
                  dir={lang === 'ar' ? 'rtl' : 'ltr'}
                  className="ix-input flex-1 text-sm"
                />
                {lang !== 'en' && (
                  <>
                    <button
                      onClick={() => translate(m.id!, lang as 'ar'|'ru'|'fr')}
                      disabled={translating === `${m.id}_${lang}`}
                      className="text-xs text-rose-600 hover:underline disabled:opacity-50 whitespace-nowrap"
                    >
                      {translating === `${m.id}_${lang}` ? '…' : '✨'}
                    </button>
                    {aiFlag && (
                      <>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">[AI]</span>
                        <button
                          onClick={() => approve(m.id!, lang as 'ar'|'ru'|'fr')}
                          className="text-xs underline text-emerald-600"
                        >Approve</button>
                      </>
                    )}
                  </>
                )}
              </div>
            </li>
          );
        })}
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
