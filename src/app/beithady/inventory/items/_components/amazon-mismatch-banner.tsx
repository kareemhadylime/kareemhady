'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Check, Loader2, X, ExternalLink, Wand2, Tag } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
  applyAmazonDetailsAction,
  suggestSkuRenameAction,
  applySkuRenameAction,
} from '../actions';

// Mismatch banner shown inline on a row when the Amazon-fetched product
// name/brand differ from the SKU's curated name/brand. Tells the operator
// "Amazon says this is X, your SKU says Y" and offers two actions:
//   1) Use Amazon details — copies fetched name + brand into the SKU
//   2) Ignore — dismisses the banner via local state (resets on next sync
//      that produces a new mismatch)

export function AmazonMismatchBanner({
  itemId,
  itemSku,
  currentName,
  currentBrand,
  amazonName,
  amazonBrand,
  amazonUrl,
  canEdit,
}: {
  itemId: string;
  itemSku: string;
  currentName: string;
  currentBrand: string | null;
  amazonName: string;
  amazonBrand: string | null;
  amazonUrl: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [skuModal, setSkuModal] = useState<{
    suggested: string;
    rationale: string;
    pending: boolean;
    error: string | null;
  } | null>(null);

  if (dismissed) return null;

  function suggestSkuRename() {
    setError(null);
    startTransition(async () => {
      const res = await suggestSkuRenameAction(itemId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSkuModal({
        suggested: res.suggested_sku,
        rationale: res.rationale,
        pending: false,
        error: null,
      });
    });
  }

  function applySkuRename() {
    if (!skuModal) return;
    setSkuModal({ ...skuModal, pending: true, error: null });
    startTransition(async () => {
      const res = await applySkuRenameAction(itemId, skuModal.suggested);
      if (res.ok) {
        setSkuModal(null);
        setDismissed(true);
        router.refresh();
      } else {
        setSkuModal(prev => prev ? { ...prev, pending: false, error: res.error } : null);
      }
    });
  }

  function apply() {
    setError(null);
    startTransition(async () => {
      const res = await applyAmazonDetailsAction(itemId);
      if (res.ok) {
        // Server-side revalidate drops the row's mismatch since names match;
        // dismiss locally so we don't flash before refresh lands.
        setDismissed(true);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-2.5 text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
      <AlertTriangle size={13} className="text-amber-600 dark:text-amber-300 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0 space-y-1">
        <div>
          <strong>Amazon listing differs from your SKU</strong>
          <span className="text-amber-700 dark:text-amber-300 ml-1 font-mono">({itemSku})</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
          <div>
            <span className="text-[10px] uppercase tracking-wide opacity-70">Your SKU</span>
            <div className="font-medium truncate" title={currentName}>{currentName}</div>
            {currentBrand && (
              <div className="text-[10px] opacity-70">brand: {currentBrand}</div>
            )}
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-wide opacity-70">Amazon EG</span>
            <div className="font-medium truncate" title={amazonName}>{amazonName}</div>
            {amazonBrand && (
              <div className="text-[10px] opacity-70">brand: {amazonBrand}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap pt-1">
          {amazonUrl && (
            <a
              href={amazonUrl}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 text-[10px] underline opacity-80 hover:opacity-100"
            >
              Open on Amazon <ExternalLink size={9} />
            </a>
          )}
          {canEdit && (
            <>
              <button
                type="button"
                onClick={apply}
                disabled={pending}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-medium hover:bg-emerald-700 disabled:opacity-50"
                title="Update SKU name + brand to match the Amazon listing"
              >
                {pending ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} strokeWidth={3} />}
                {pending ? 'Updating…' : 'Use Amazon details'}
              </button>
              <button
                type="button"
                onClick={suggestSkuRename}
                disabled={pending}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-600 text-white text-[10px] font-medium hover:bg-cyan-700 disabled:opacity-50"
                title="Ask AI to suggest a new SKU code that matches the Amazon product (size + brand). Safe — items.id is the FK target, SKU is just a label."
              >
                {pending ? <Loader2 size={10} className="animate-spin" /> : <Wand2 size={10} />}
                Rename SKU via AI
              </button>
              <button
                type="button"
                onClick={() => setDismissed(true)}
                disabled={pending}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 text-[10px] hover:bg-amber-100 dark:hover:bg-amber-950/60"
                title="Hide this banner (will reappear on next sync if names still differ)"
              >
                <X size={10} />
                Ignore
              </button>
            </>
          )}
          {error && (
            <span className="text-[10px] text-rose-700 dark:text-rose-300">{error}</span>
          )}
        </div>
      </div>

      {/* SKU rename confirmation modal */}
      {skuModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-md">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold inline-flex items-center gap-1.5" style={{ color: 'var(--bh-heading)' }}>
                  <Tag size={14} className="text-cyan-600" /> Rename SKU?
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  AI suggested based on the Amazon listing
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSkuModal(null)}
                disabled={skuModal.pending}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 shrink-0"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="block text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">
                    Old SKU
                  </span>
                  <div className="font-mono text-[12px] text-slate-700 dark:text-slate-200 truncate">
                    {itemSku}
                  </div>
                </div>
                <div>
                  <span className="block text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300 font-medium mb-1">
                    New SKU
                  </span>
                  <div className="font-mono text-[12px] font-semibold text-emerald-700 dark:text-emerald-300 truncate">
                    {skuModal.suggested}
                  </div>
                </div>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">
                  AI rationale
                </span>
                <p className="text-slate-700 dark:text-slate-200 text-[11px] leading-relaxed">
                  {skuModal.rationale}
                </p>
              </div>
              <div className="bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-200 dark:border-cyan-800 rounded p-2 text-[10px] text-cyan-800 dark:text-cyan-200">
                <strong>Safe to rename:</strong> SKU is a unique label only — items.id is the FK target across stock/transactions/rules tables, so renaming items.sku does NOT cascade or break references.
              </div>
              {skuModal.error && (
                <div className="text-rose-700 bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200 rounded p-2 text-[11px]">
                  {skuModal.error}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setSkuModal(null)}
                  disabled={skuModal.pending}
                  className="px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={applySkuRename}
                  disabled={skuModal.pending}
                  className="px-3 py-1.5 text-[11px] font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {skuModal.pending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} strokeWidth={3} />}
                  {skuModal.pending ? 'Renaming…' : 'Apply rename'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Returns true when the canonical SKU label clearly differs from the
 * Amazon listing. Loose match — case + punctuation + extra whitespace
 * don't trigger a mismatch. Used as the gate for showing the banner.
 */
export function shouldShowAmazonMismatch(args: {
  itemName: string;
  itemBrand: string | null;
  amazonName: string | null;
  amazonBrand: string | null;
}): boolean {
  if (!args.amazonName || args.amazonName.trim().length === 0) return false;
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const a = normalize(args.itemName);
  const b = normalize(args.amazonName);
  if (a === b) return false;
  // Substring match either way — operator's short label is contained in
  // Amazon's longer title, or vice versa. e.g. "Bleach 1L" ⊂ "Clorox Bleach 1L Original".
  if (a.length >= 4 && b.includes(a)) return false;
  if (b.length >= 4 && a.includes(b)) return false;
  return true;
}
