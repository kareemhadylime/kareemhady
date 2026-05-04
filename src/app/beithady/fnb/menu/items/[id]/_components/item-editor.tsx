'use client';
import { useState } from 'react';
import type { Item, Category } from '@/lib/beithady/fnb/types';
import { BasicsForm } from './basics-form';
import { PhotoForm } from './photo-form';
import { ModifiersForm } from './modifiers-form';

const INNER_TABS = [
  { key: 'basics',       label: 'Basics' },
  { key: 'photo',        label: 'Photo' },
  { key: 'modifiers',    label: 'Modifiers' },
  { key: 'availability', label: 'Availability' },
  { key: 'recipe',       label: 'Recipe (Phase F&B-2)' },
] as const;
type TabKey = typeof INNER_TABS[number]['key'];

export function ItemEditor({
  initialItem, categories,
}: { initialItem: Item; categories: Category[] }) {
  const [tab, setTab] = useState<TabKey>('basics');
  const [item, setItem] = useState(initialItem);

  return (
    <div className="ix-card p-6">
      <h2 className="text-lg font-semibold mb-1">{item.name_en}</h2>
      <p className="text-sm text-slate-500 mb-4">
        ${item.price_usd.toFixed(2)} · {item.enabled ? 'Enabled' : 'Disabled'}
      </p>

      <nav className="flex gap-2 border-b border-slate-200 dark:border-slate-700 mb-4">
        {INNER_TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            disabled={t.key === 'recipe'}
            className={`px-3 py-2 text-sm font-medium ${
              tab === t.key
                ? 'text-rose-600 border-b-2 border-rose-600'
                : 'text-slate-600 dark:text-slate-300'
            } ${t.key === 'recipe' ? 'opacity-40 cursor-not-allowed' : ''}`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'basics' && (
        <BasicsForm item={item} categories={categories} onSaved={setItem} />
      )}
      {tab === 'photo' && <PhotoForm item={item} onSaved={setItem} />}
      {tab === 'modifiers' && <ModifiersForm itemId={item.id!} />}
      {tab === 'availability' && (
        <div className="text-slate-500 text-sm">Availability + stock-out — wired in Task 18.</div>
      )}
      {tab === 'recipe' && (
        <div className="text-slate-500 text-sm">Phase F&B-2 — recipe + inventory link.</div>
      )}
    </div>
  );
}
