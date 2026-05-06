'use client';
import Link from 'next/link';
import { useState } from 'react';
import type { Category, Item } from '@/lib/beithady/fnb/types';

export function CategoryTree({
  categories, items,
}: { categories: Category[]; items: Item[] }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return (
    <div className="ix-card p-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
        Categories
      </h3>
      <ul className="space-y-1">
        {categories.map(c => {
          const catItems = items.filter(i => i.category_id === c.id);
          const isOpen = open[c.id!] ?? true;
          return (
            <li key={c.id}>
              <button
                onClick={() => setOpen(o => ({ ...o, [c.id!]: !isOpen }))}
                className="w-full text-left px-2 py-1.5 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
              >
                {isOpen ? '▾' : '▸'} {c.name_en} ({catItems.length})
              </button>
              {isOpen && (
                <ul className="ml-4 mt-1 space-y-0.5">
                  {catItems.map(i => (
                    <li key={i.id}>
                      <Link
                        href={`/beithady/fnb/menu/items/${i.id}`}
                        className="block px-2 py-1 text-sm text-slate-700 dark:text-slate-300 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded"
                      >
                        {i.name_en}{' '}
                        <span className="text-xs text-slate-400">
                          ${i.price_usd.toFixed(2)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      <button className="w-full mt-3 text-sm text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 px-2 py-1.5 rounded">
        + Add category
      </button>
    </div>
  );
}
