'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Pencil, X, Check, Loader2, AlertTriangle, ExternalLink, Edit3,
} from 'lucide-react';
import { setManualAmazonPriceAction } from '../actions';

// Manual price entry button — operator's escape hatch for items where
// Amazon EG blocks Claude's auto-fetch (status='rate_limited' or '404').
// Operator opens the product page in a new tab, reads the price, types
// it in. Gets a clean 'ok' status afterwards so the cost cell flips
// from amber estimate to plain live price.

export function ManualPriceButton({
  itemId,
  itemSku,
  itemNameEn,
  amazonEgUrl,
  currentPrice,
  currentPackSize,
  currentName,
  currentBrand,
  showLabel = false,
}: {
  itemId: string;
  itemSku: string;
  itemNameEn: string;
  amazonEgUrl: string | null;
  currentPrice: number | null;
  currentPackSize: number | null;
  currentName: string | null;
  currentBrand: string | null;
  showLabel?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState<string>(currentPrice != null ? String(currentPrice) : '');
  const [packSize, setPackSize] = useState<string>(currentPackSize != null ? String(currentPackSize) : '1');
  const [name, setName] = useState<string>(currentName || '');
  const [brand, setBrand] = useState<string>(currentBrand || '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openModal() {
    setPrice(currentPrice != null ? String(currentPrice) : '');
    setPackSize(currentPackSize != null ? String(currentPackSize) : '1');
    setName(currentName || '');
    setBrand(currentBrand || '');
    setError(null);
    setOpen(true);
  }

  function save() {
    setError(null);
    const priceNum = Number(price);
    const packNum = Number(packSize);
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      setError('Price must be a positive number');
      return;
    }
    if (!Number.isFinite(packNum) || packNum < 1) {
      setError('Pack size must be at least 1');
      return;
    }
    startTransition(async () => {
      const res = await setManualAmazonPriceAction(itemId, {
        price_egp: priceNum,
        pack_size: packNum,
        name_en: name.trim() || null,
        brand: brand.trim() || null,
      });
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        title="Enter the price you see on the Amazon page (used when auto-fetch is blocked)"
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-200"
      >
        <Edit3 size={10} />
        {showLabel ? 'Set price manually' : 'Manual price'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-lg">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--bh-heading)' }}>
                  Enter price manually
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  {itemSku} — <span className="font-sans">{itemNameEn}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 shrink-0"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded p-2.5 text-[11px] text-amber-800 dark:text-amber-200 flex items-start gap-2">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <div>
                  <strong>Auto-fetch is blocked by Amazon EG.</strong> Open the product page below, read the live price + pack size, and type them here.
                  {amazonEgUrl && (
                    <>
                      {' '}
                      <a
                        href={amazonEgUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="underline inline-flex items-center gap-0.5"
                      >
                        Open product <ExternalLink size={9} />
                      </a>
                    </>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">
                    Price (EGP) *
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0.01"
                    value={price}
                    onChange={e => setPrice(e.target.value)}
                    placeholder="90"
                    className="ix-input w-full"
                    autoFocus
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">After-discount price near the Add to Cart button</p>
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">
                    Pack size *
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    step="1"
                    value={packSize}
                    onChange={e => setPackSize(e.target.value)}
                    placeholder="1"
                    className="ix-input w-full"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">1 = single unit, 2+ = "Pack of N"</p>
                </label>
              </div>

              <label className="block">
                <span className="block text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">
                  Product name (optional override)
                </span>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="e.g. Raid Flying Insect Killer Odorless 300 ML"
                  className="ix-input w-full"
                  maxLength={200}
                />
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Leaving blank keeps the current name. Fill it in to match the Amazon title.
                </p>
              </label>

              <label className="block">
                <span className="block text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">
                  Brand (optional)
                </span>
                <input
                  type="text"
                  value={brand}
                  onChange={e => setBrand(e.target.value)}
                  placeholder="e.g. Raid"
                  className="ix-input w-full"
                  maxLength={80}
                />
              </label>

              {error && (
                <div className="text-rose-700 bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200 rounded p-2 text-[11px]">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={save}
                  disabled={pending || !price.trim()}
                  className="px-3 py-1.5 text-[11px] font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {pending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} strokeWidth={3} />}
                  {pending ? 'Saving…' : 'Save price'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
