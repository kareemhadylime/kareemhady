'use client';
import { useState } from 'react';
import type { Item, Modifier } from '@/lib/beithady/fnb/types';
import { ItemSheet } from './item-sheet';

export function ItemCard({
  item, modifiers, outOfStock,
}: { item: Item; modifiers: Modifier[]; outOfStock: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <article
        className={`dine-item-row ${outOfStock ? 'dine-stockout' : ''}`}
        onClick={() => !outOfStock && setOpen(true)}
        style={{ cursor: outOfStock ? 'default' : 'pointer' }}
      >
        <h3 className="dine-item-name">{item.name_en}</h3>
        <span className="dine-item-price">${item.price_usd.toFixed(0)}</span>
        {item.description_en && (
          <p className="dine-item-desc">{item.description_en}</p>
        )}
        {modifiers.map(m => (
          <p
            key={m.id}
            className="dine-item-desc"
            style={{ paddingLeft: '1rem', fontStyle: 'italic' }}
          >
            + {m.name_en} ${m.price_delta_usd.toFixed(0)}
          </p>
        ))}
      </article>
      {open && (
        <ItemSheet
          item={item}
          modifiers={modifiers}
          onClose={() => setOpen(false)}
          outOfStock={outOfStock}
        />
      )}
    </>
  );
}
