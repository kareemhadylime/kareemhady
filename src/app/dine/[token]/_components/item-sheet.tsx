'use client';
import { useState } from 'react';
import type { Item, Modifier } from '@/lib/beithady/fnb/types';
import { cart } from './cart-store';

export function ItemSheet({
  item, modifiers, onClose, outOfStock,
}: {
  item: Item;
  modifiers: Modifier[];
  onClose: () => void;
  outOfStock: boolean;
}) {
  const [qty, setQty] = useState(1);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState('');

  const lineTotal =
    qty * (item.price_usd +
      modifiers
        .filter(m => picked.has(m.id!))
        .reduce((s, m) => s + m.price_delta_usd, 0));

  function add() {
    cart.add({
      item_id: item.id!,
      item_name: item.name_en,
      unit_price_usd: item.price_usd,
      quantity: qty,
      modifier_ids: [...picked],
      modifiers: modifiers
        .filter(m => picked.has(m.id!))
        .map(m => ({ id: m.id!, name: m.name_en, price_delta_usd: m.price_delta_usd })),
      notes,
    });
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(15,63,88,0.5)' }}
      onClick={onClose}
    >
      <div
        className="dine-surface w-full max-w-md rounded-t-2xl p-6"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="display text-2xl mb-2">{item.name_en}</h3>
        <span className="dine-item-price text-lg block mb-3">
          ${item.price_usd.toFixed(0)}
        </span>
        {item.description_en && (
          <p className="dine-item-desc mb-4">{item.description_en}</p>
        )}
        {modifiers.length > 0 && (
          <fieldset className="mb-4">
            <legend className="text-xs uppercase tracking-wide font-semibold mb-2">
              Add-ons
            </legend>
            {modifiers.map(m => (
              <label key={m.id} className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  checked={picked.has(m.id!)}
                  onChange={e => {
                    setPicked(s => {
                      const n = new Set(s);
                      if (e.target.checked) n.add(m.id!); else n.delete(m.id!);
                      return n;
                    });
                  }}
                />
                <span className="text-sm">
                  {m.name_en} +${m.price_delta_usd.toFixed(0)}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm">Quantity</span>
          <button
            onClick={() => setQty(q => Math.max(1, q - 1))}
            className="w-8 h-8 rounded-full border"
          >−</button>
          <span className="font-semibold">{qty}</span>
          <button
            onClick={() => setQty(q => Math.min(10, q + 1))}
            className="w-8 h-8 rounded-full border"
          >+</button>
        </div>
        <label className="block mb-4">
          <span className="text-xs uppercase tracking-wide font-semibold">
            Notes (optional)
          </span>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value.slice(0, 200))}
            className="w-full mt-1 rounded border p-2 text-sm"
            rows={2}
            placeholder="No onions, extra sauce, …"
          />
        </label>
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-full border"
            style={{ borderColor: 'var(--bh-navy)', color: 'var(--bh-navy)' }}
          >Cancel</button>
          <button
            onClick={add}
            disabled={outOfStock}
            className="flex-1 py-3 rounded-full text-white disabled:opacity-50"
            style={{ background: 'var(--bh-navy)' }}
          >Add to order · ${lineTotal.toFixed(0)}</button>
        </div>
      </div>
    </div>
  );
}
