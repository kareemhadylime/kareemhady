'use client';
import { useState } from 'react';
import type { Item, Modifier } from '@/lib/beithady/fnb/types';
import { ItemSheet } from './item-sheet';
import { formatPrice, type DineLang } from './i18n';

export function ItemCard({
  item, modifiers, outOfStock, lang = 'en',
}: { item: Item; modifiers: Modifier[]; outOfStock: boolean; lang?: DineLang }) {
  const [open, setOpen] = useState(false);
  const description =
    (item as unknown as { description?: string | null }).description ?? item.description_en;
  return (
    <>
      <article
        className={`dine-item-row ${outOfStock ? 'dine-stockout' : ''}`}
        onClick={() => !outOfStock && setOpen(true)}
        style={{ cursor: outOfStock ? 'default' : 'pointer' }}
      >
        <h3 className="dine-item-name">{(item as unknown as { name?: string }).name ?? item.name_en}</h3>
        <span className="dine-item-price">{formatPrice(item.price_usd, lang)}</span>
        {(description || modifiers.length > 0) && (
          <div className="dine-item-meta">
            {description && <p className="dine-item-desc">{description}</p>}
            {modifiers.map(m => (
              <p key={m.id} className="dine-item-modifier">
                + {(m as unknown as { name?: string }).name ?? m.name_en} {formatPrice(m.price_delta_usd, lang)}
              </p>
            ))}
          </div>
        )}
      </article>
      {open && (
        <ItemSheet
          item={item}
          modifiers={modifiers}
          onClose={() => setOpen(false)}
          outOfStock={outOfStock}
          lang={lang}
        />
      )}
    </>
  );
}
