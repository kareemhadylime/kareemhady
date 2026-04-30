'use client';

import { useState, useTransition } from 'react';
import {
  Search,
  ExternalLink,
  Check,
  Pencil,
  X,
  CircleDot,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { setAmazonSourceAction, acceptAmazonSourceAction } from '../actions';

// Per-row Amazon EG source affordance for the items list.
//
// Three visual states:
//  • URL = null            → "Search Amazon EG" + "Set URL"
//  • URL set, not reviewed → "Open product"     + "Accept"   + "Change"
//  • URL set + reviewed    → "Open product"     + ✓ Reviewed + "Change"

function buildAmazonSearchUrl(itemNameEn: string): string {
  return `https://www.amazon.eg/s?k=${encodeURIComponent(itemNameEn.trim())}`;
}

export function SourceCell({
  itemId,
  itemSku,
  itemNameEn,
  amazonEgUrl,
  reviewedAt,
  reviewedByName,
  canEdit,
}: {
  itemId: string;
  itemSku: string;
  itemNameEn: string;
  amazonEgUrl: string | null;
  reviewedAt: string | null;
  reviewedByName: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [draftUrl, setDraftUrl] = useState(amazonEgUrl || '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAccept() {
    setError(null);
    startTransition(async () => {
      const res = await acceptAmazonSourceAction(itemId);
      if (res.ok) router.refresh();
      else setError(res.error);
    });
  }

  function handleSave(action: 'save' | 'clear') {
    setError(null);
    startTransition(async () => {
      const url = action === 'clear' ? null : draftUrl.trim();
      const res = await setAmazonSourceAction(itemId, url);
      if (res.ok) {
        setPopoverOpen(false);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  function openPopover() {
    setDraftUrl(amazonEgUrl || '');
    setError(null);
    setPopoverOpen(true);
  }

  const reviewed = !!reviewedAt;
  const reviewedDateLabel = reviewedAt
    ? new Date(reviewedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
    : null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {/* Primary link — direct product or search fallback */}
      {amazonEgUrl ? (
        <a
          href={amazonEgUrl}
          target="_blank"
          rel="noreferrer noopener"
          title={`Open product on Amazon EG`}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200 hover:underline"
        >
          <ExternalLink size={10} />
          Open product
        </a>
      ) : (
        <a
          href={buildAmazonSearchUrl(itemNameEn)}
          target="_blank"
          rel="noreferrer noopener"
          title={`Search Amazon EG for "${itemNameEn}"`}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 hover:bg-emerald-100 hover:text-emerald-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-emerald-900/40 dark:hover:text-emerald-200 hover:underline"
        >
          <Search size={10} /> Search
        </a>
      )}

      {/* Review state badge */}
      {amazonEgUrl && reviewed && (
        <span
          className="inline-flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-300"
          title={`Reviewed${reviewedDateLabel ? ` ${reviewedDateLabel}` : ''}${reviewedByName ? ` · ${reviewedByName}` : ''}`}
        >
          <Check size={11} strokeWidth={3} />
          {reviewedDateLabel}
        </span>
      )}
      {amazonEgUrl && !reviewed && (
        <span
          className="inline-flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-300"
          title="URL set but not yet confirmed by an operator"
        >
          <CircleDot size={10} /> Needs review
        </span>
      )}

      {/* Action buttons (admin/manager/ops/warehouse_manager only) */}
      {canEdit && amazonEgUrl && !reviewed && (
        <button
          type="button"
          disabled={pending}
          onClick={handleAccept}
          title="Accept this URL as correct"
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {pending ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} strokeWidth={3} />}
          Accept
        </button>
      )}
      {canEdit && (
        <button
          type="button"
          disabled={pending}
          onClick={openPopover}
          title={amazonEgUrl ? 'Change source URL' : 'Set source URL'}
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 disabled:opacity-50"
        >
          <Pencil size={10} />
          {amazonEgUrl ? 'Change' : 'Set URL'}
        </button>
      )}

      {error && !popoverOpen && (
        <span className="text-[10px] text-rose-700 dark:text-rose-300 inline-flex items-center gap-1">
          <AlertTriangle size={10} /> {error}
        </span>
      )}

      {/* Change / Set popover */}
      {popoverOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-lg">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold" style={{ color: 'var(--bh-heading)' }}>
                  {amazonEgUrl ? 'Change Amazon EG source' : 'Set Amazon EG source'}
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                  {itemSku} — <span className="font-sans">{itemNameEn}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPopoverOpen(false)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 shrink-0"
              >
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <label className="block">
                <span className="block text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">
                  Canonical product URL
                </span>
                <input
                  type="url"
                  value={draftUrl}
                  onChange={e => setDraftUrl(e.target.value)}
                  placeholder="https://www.amazon.eg/dp/B0XXXXXXXX"
                  className="ix-input w-full font-mono text-[11px]"
                  autoFocus
                />
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                  Any Amazon EG product URL works — bare <code>/dp/&lt;ASIN&gt;</code>,
                  {' '}<code>/gp/product/&lt;ASIN&gt;</code>, or the SEO-slug form
                  {' '}<code>/Product-Name/dp/&lt;ASIN&gt;/ref=…</code>. We strip
                  the slug + tracking refs and store the canonical link.
                  Saving clears price + pack-size + image + review status —
                  re-Accept after the next sourcing sync confirms the new product.
                </p>
              </label>
              {error && (
                <div className="text-rose-700 bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200 rounded p-2 text-[11px]">
                  {error}
                </div>
              )}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                {amazonEgUrl && (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleSave('clear')}
                    className="px-3 py-1.5 text-[11px] text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded disabled:opacity-50"
                  >
                    Clear source
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPopoverOpen(false)}
                  className="px-3 py-1.5 text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSave('save')}
                  disabled={pending || !draftUrl.trim()}
                  className="px-3 py-1.5 text-[11px] font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {pending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} strokeWidth={3} />}
                  {pending ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
