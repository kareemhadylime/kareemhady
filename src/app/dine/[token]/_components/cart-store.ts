'use client';
import { useSyncExternalStore } from 'react';

export interface CartLine {
  id: string;                  // UUID, client-generated
  item_id: string;
  item_name: string;
  unit_price_usd: number;
  quantity: number;
  modifier_ids: string[];
  modifiers: { id: string; name: string; price_delta_usd: number }[];
  notes: string;
}

interface CartState {
  lines: CartLine[];
}

const KEY = 'bh-fnb-cart-v1';
let state: CartState = (() => {
  if (typeof window === 'undefined') return { lines: [] };
  try { return JSON.parse(localStorage.getItem(KEY) || '{"lines":[]}'); }
  catch { return { lines: [] }; }
})();
const subs = new Set<() => void>();

function emit() {
  subs.forEach(fn => fn());
  if (typeof window !== 'undefined') localStorage.setItem(KEY, JSON.stringify(state));
}

function getSnap() { return state; }
function subscribe(cb: () => void) { subs.add(cb); return () => subs.delete(cb); }

// React 19 + useSyncExternalStore requires getServerSnapshot to return a
// stable cached reference — returning `{ lines: [] }` on every call would
// throw "The result of getServerSnapshot should be cached" at runtime,
// surfacing in the console as a script error and breaking SSR hydration.
const SERVER_SNAP: CartState = { lines: [] };
function getServerSnap() { return SERVER_SNAP; }

export function useCart() {
  return useSyncExternalStore(subscribe, getSnap, getServerSnap);
}

export const cart = {
  add(line: Omit<CartLine, 'id'>) {
    state = { lines: [...state.lines, { ...line, id: crypto.randomUUID() }] };
    emit();
  },
  remove(id: string) {
    state = { lines: state.lines.filter(l => l.id !== id) };
    emit();
  },
  setQty(id: string, qty: number) {
    state = {
      lines: state.lines.map(l => l.id === id ? { ...l, quantity: qty } : l),
    };
    emit();
  },
  clear() { state = { lines: [] }; emit(); },
  total() {
    return state.lines.reduce(
      (s, l) =>
        s + l.quantity *
          (l.unit_price_usd + l.modifiers.reduce((a, m) => a + m.price_delta_usd, 0)),
      0,
    );
  },
};
