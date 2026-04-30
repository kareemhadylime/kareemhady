'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Check, Loader2, X, ExternalLink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { applyAmazonDetailsAction } from '../actions';

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

  if (dismissed) return null;

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
