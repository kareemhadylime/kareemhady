'use client';

import { useState, useTransition, useMemo, useRef, useEffect, useLayoutEffect } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  Archive,
  Mail,
  ChevronDown,
  ExternalLink,
  CheckCircle,
  X as XIcon,
  Inbox,
} from 'lucide-react';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import {
  archiveInGmail,
  markAsRead,
  moveEmail,
  archiveAllInCategory,
  markAllReadInCategory,
  moveAllInCategory,
  fetchEmailHtmlAction,
} from '../actions';
import { CATEGORIES } from '@/lib/personal-email/categories';
import type { CategorySlug } from '@/lib/personal-email/types';
import type { InboxRow, SelectedEmail } from '@/lib/personal-email/inbox-query';
import { isNewReservation, isImmediateIntervention, isInvoiceToBePaid, isLowPriority, markerTier } from '@/lib/personal-email/email-helpers';
import { sanitizeBodyExcerptForDisplay } from '@/lib/personal-email/sanitize-body-excerpt';

// User-pickable secondary sort (priority tier still floats to top).
type SortMode = 'date-desc' | 'date-asc' | 'sender-asc' | 'sender-desc';

const SORT_LABELS: Record<SortMode, string> = {
  'date-desc': 'Date ↓ Newest',
  'date-asc':  'Date ↑ Oldest',
  'sender-asc':  'Sender A→Z',
  'sender-desc': 'Sender Z→A',
};

// Sort key for the "Sender" sorts. Strip the angle-bracket-wrapped
// email when a display name is present ("John Doe <j@d.com>" → "John
// Doe"); otherwise fall back to the bare address so unnamed senders
// still order deterministically. Case-insensitive.
function senderSortKey(fromAddress: string | null): string {
  if (!fromAddress) return '';
  const namePart = fromAddress.split('<')[0].trim();
  if (namePart) return namePart.toLowerCase();
  const inAngles = fromAddress.match(/<([^>]+)>/);
  return (inAngles?.[1] ?? fromAddress).toLowerCase();
}

// Re-export for back-compat with existing callers (page.tsx imports
// `SelectedEmail` from this module).
export type { SelectedEmail };

// Master-detail drill-down: list on the left, preview on the right.
// Selected email lives in URL as `?msg=<id>` so deep links work and
// server can pre-render the preview. Multi-select state is local
// (Set<string>) and powers the bulk-action bar at the top of the list.

export function DrillDownView({
  rows,
  selected,
  category,
  totalCount,
  accountId,
}: {
  rows: InboxRow[];
  selected: SelectedEmail | null;
  // Optional. When set, the "Move to" dropdown hides the current
  // category (moving to the same bucket is a no-op). On surfaces like
  // /personal/email/needs-review where rows span many categories, leave
  // it undefined so the dropdown shows everything.
  category?: CategorySlug;
  // Optional. Total emails in this category (possibly > rows.length
  // since the list caps at 500). Drives the Gmail-style "Select all N
  // in <Category>" banner that escalates a page-select into an action
  // covering every row in the category.
  totalCount?: number;
  // Optional. Current account filter ("All", or a single mailbox id)
  // passed through to the bulk-all server actions so they stay scoped
  // to whatever the user is looking at.
  accountId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [moveOpen, setMoveOpen] = useState(false);
  // "Select all in <Category>" escalation. When true, bulk actions
  // ignore `checked` and instead call the *-AllInCategory server
  // actions that match (category, accountId) on the server.
  const [selectAllInCategory, setSelectAllInCategory] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('date-desc');

  // Refs for scroll-position preservation. The list `<ul>` keeps its
  // own internal scroll (max-h-[70vh] overflow-y-auto). Without these
  // hooks, every server-component re-render on `?msg=` change resets
  // the scroll to 0 because the soft navigation re-streams a new
  // element that React's reconciler treats as the same identity but
  // browsers still snap scrollTop on certain paint cycles. We capture
  // scrollTop the moment a row is clicked and restore it on the next
  // commit, then nudge the selected row into view if it's off-screen.
  const listRef = useRef<HTMLUListElement>(null);
  const pendingScrollRef = useRef<number | null>(null);

  // Sort marked-and-still-active rows to the top, normal rows below.
  // "Active" = the marker pattern matches AND the user hasn't taken
  // an action yet (not read, not archived, not manually moved). Once
  // the user reads/archives/moves, the row drops to natural date
  // order on next refresh.
  //
  // Priority tier ALWAYS wins. Within a tier, the user-picked sortMode
  // decides ordering — defaults to date-desc which is the historical
  // behavior.
  const sortedRows = useMemo(() => {
    const scored = rows.map(r => ({
      r,
      tier: markerTier({
        subject: r.subject,
        category: r.category,
        category_method: r.category_method,
        needs_review: r.needs_review,
        label_ids: r.label_ids,
        to_address: r.to_address,
        account_email: r.account_email,
      }),
      ts: r.received_at ? Date.parse(r.received_at) : 0,
      sender: senderSortKey(r.from_address),
    }));
    scored.sort((a, b) => {
      // Lower tier number = higher precedence (urgent=0 wins over to-pay=1).
      if (a.tier !== b.tier) return a.tier - b.tier;
      switch (sortMode) {
        case 'date-desc': return b.ts - a.ts;
        case 'date-asc':  return a.ts - b.ts;
        case 'sender-asc':  return a.sender.localeCompare(b.sender);
        case 'sender-desc': return b.sender.localeCompare(a.sender);
      }
    });
    return scored.map(s => s.r);
  }, [rows, sortMode]);

  const allChecked = sortedRows.length > 0 && sortedRows.every(r => checked.has(r.id));
  const anyChecked = checked.size > 0 || selectAllInCategory;
  // Show the Gmail-style "Select all N in <Category>" banner only when
  // the user has selected every row on this page AND the category has
  // more rows than this page can show AND they haven't already
  // escalated. Requires a known category + totalCount (the surfaces
  // that don't pass them, like needs-review, get no banner).
  const canEscalateSelectAll =
    !!category &&
    typeof totalCount === 'number' &&
    allChecked &&
    !selectAllInCategory &&
    totalCount > sortedRows.length;

  function navTo(id: string | null) {
    // Snapshot the list's internal scroll BEFORE the navigation kicks
    // off so the post-nav effect can restore it. Server-component
    // re-renders on search-param change otherwise dump scrollTop back
    // to 0 in some paint sequences, which manifests as "list jumps to
    // top whenever I click an email". {scroll:false} only suppresses
    // the window-level scroll-to-top — it doesn't help element scroll.
    if (listRef.current) {
      pendingScrollRef.current = listRef.current.scrollTop;
    }
    const params = new URLSearchParams(sp.toString());
    if (id) params.set('msg', id);
    else params.delete('msg');
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  // Restore captured scrollTop synchronously BEFORE paint so the user
  // never sees the list flash to 0. useLayoutEffect runs after DOM
  // mutations but before the browser paints, which is exactly the
  // window where a server-component re-render would otherwise
  // present a scrolled-to-top view.
  useLayoutEffect(() => {
    const ul = listRef.current;
    if (!ul) return;
    if (pendingScrollRef.current != null) {
      ul.scrollTop = pendingScrollRef.current;
      pendingScrollRef.current = null;
    }
  });

  // After paint, ensure the selected row is at least in view (no-op if
  // it already is — block:'nearest' only scrolls when needed).
  useEffect(() => {
    const ul = listRef.current;
    if (!ul || !selected?.id) return;
    const el = ul.querySelector<HTMLLIElement>(
      `[data-row-id="${selected.id}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected?.id]);

  function toggleOne(id: string) {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setChecked(allChecked ? new Set() : new Set(rows.map(r => r.id)));
  }

  function clearSelection() {
    setChecked(new Set());
    setSelectAllInCategory(false);
  }

  function onArchive() {
    if (selectAllInCategory && category) {
      start(async () => {
        await archiveAllInCategory(category, accountId);
        clearSelection();
      });
      return;
    }
    const ids = [...checked];
    if (!ids.length) return;
    start(async () => {
      await archiveInGmail(ids);
      clearSelection();
    });
  }

  function onMarkRead() {
    if (selectAllInCategory && category) {
      start(async () => {
        await markAllReadInCategory(category, accountId);
        clearSelection();
      });
      return;
    }
    const ids = [...checked];
    if (!ids.length) return;
    start(async () => {
      await markAsRead(ids);
      clearSelection();
    });
  }

  function onMoveTo(target: CategorySlug) {
    setMoveOpen(false);
    if (selectAllInCategory && category) {
      start(async () => {
        await moveAllInCategory(category, target, accountId);
        clearSelection();
      });
      return;
    }
    const ids = [...checked];
    if (!ids.length) return;
    start(async () => {
      // Server action moveEmail takes one ID at a time; loop client-side.
      for (const id of ids) {
        await moveEmail(id, target);
      }
      clearSelection();
    });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
      {/* Left column: list with checkboxes + bulk-action bar */}
      <div className="lg:col-span-3 ix-card overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/40 flex items-center gap-3 min-h-[44px]">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={toggleAll}
            className="h-4 w-4 cursor-pointer"
            title={allChecked ? 'Deselect all' : 'Select all'}
          />
          {anyChecked ? (
            <BulkBar
              count={selectAllInCategory ? (totalCount ?? checked.size) : checked.size}
              countLabel={selectAllInCategory ? `all in ${categoryDisplayName(category)}` : null}
              pending={pending}
              onArchive={onArchive}
              onMarkRead={onMarkRead}
              onClear={clearSelection}
              moveOpen={moveOpen}
              setMoveOpen={setMoveOpen}
              onMoveTo={onMoveTo}
              currentCategory={category}
            />
          ) : (
            <span className="text-xs text-slate-600 dark:text-slate-300">
              {typeof totalCount === 'number' && totalCount > rows.length
                ? `${rows.length} of ${totalCount.toLocaleString()} email${totalCount === 1 ? '' : 's'}`
                : `${rows.length} email${rows.length === 1 ? '' : 's'}`}
            </span>
          )}
          <SortDropdown sortMode={sortMode} setSortMode={setSortMode} />
        </div>

        {canEscalateSelectAll && (
          <div className="px-3 py-1.5 border-b border-indigo-200 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/30 text-[11px] flex items-center justify-center gap-2 flex-wrap text-indigo-900 dark:text-indigo-100">
            <span>
              All <span className="font-mono tabular-nums">{sortedRows.length}</span> on this page are selected.
            </span>
            <button
              type="button"
              onClick={() => setSelectAllInCategory(true)}
              className="font-semibold underline underline-offset-2 hover:text-indigo-700 dark:hover:text-indigo-200"
            >
              Select all {totalCount!.toLocaleString()} in {categoryDisplayName(category)}
            </button>
          </div>
        )}

        <ul ref={listRef} className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[70vh] overflow-y-auto">
          {sortedRows.map(r => {
            const isSelected = selected?.id === r.id;
            const isChecked = checked.has(r.id);
            const isUnread = r.label_ids.includes('UNREAD');
            const newReservation = isNewReservation(r.subject, r.category);
            const urgent = isImmediateIntervention(r.subject, r.category);
            const toPay = isInvoiceToBePaid(r.subject, r.category);
            const lowPriority = isLowPriority(r.to_address, r.account_email);
            // Precedence: urgent > toPay > newReservation > low-priority.
            // Low-priority also dims the text color.
            const rowAccentClass = urgent
              ? 'bg-rose-50/40 dark:bg-rose-950/15 hover:bg-rose-50/70 dark:hover:bg-rose-950/35'
              : toPay
                ? 'bg-yellow-50/40 dark:bg-yellow-950/15 hover:bg-yellow-50/70 dark:hover:bg-yellow-950/35'
                : newReservation
                  ? 'bg-emerald-50/30 dark:bg-emerald-950/10 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30'
                  : lowPriority
                    ? 'opacity-70 hover:bg-slate-50 dark:hover:bg-slate-900/40'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-900/40';
            return (
              <li
                key={r.id}
                data-row-id={r.id}
                className={`flex items-start gap-2 px-3 py-2 transition cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-50 dark:bg-indigo-950/40 ring-2 ring-inset ring-indigo-400 dark:ring-indigo-500'
                    : isChecked
                      ? 'bg-amber-50/40 dark:bg-amber-950/20'
                      : rowAccentClass
                }`}
                onClick={() => navTo(r.id)}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleOne(r.id)}
                  onClick={e => e.stopPropagation()}
                  className="mt-1 h-4 w-4 cursor-pointer shrink-0"
                />
                {/* Left edge accent: solid color bar by precedence —
                    urgent (rose), invoice-to-pay (yellow), new
                    reservation (emerald). One bar at a time. */}
                {urgent ? (
                  <span className="self-stretch w-0.5 -mx-1 bg-rose-500 rounded-full shrink-0" aria-hidden />
                ) : toPay ? (
                  <span className="self-stretch w-0.5 -mx-1 bg-yellow-500 rounded-full shrink-0" aria-hidden />
                ) : newReservation ? (
                  <span className="self-stretch w-0.5 -mx-1 bg-emerald-500 rounded-full shrink-0" aria-hidden />
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate flex items-center gap-1.5">
                    {urgent && (
                      <span className="shrink-0 text-[9px] font-bold tracking-wider px-1 py-0.5 rounded bg-rose-600 text-white">
                        URGENT
                      </span>
                    )}
                    {toPay && !urgent && (
                      <span className="shrink-0 text-[9px] font-bold tracking-wider px-1 py-0.5 rounded bg-yellow-500 text-black">
                        TO PAY
                      </span>
                    )}
                    {newReservation && !urgent && !toPay && (
                      <span className="shrink-0 text-[9px] font-bold tracking-wider px-1 py-0.5 rounded bg-emerald-500 text-white">
                        NEW
                      </span>
                    )}
                    {lowPriority && !urgent && !toPay && !newReservation && (
                      <span
                        className="shrink-0 text-[9px] font-bold tracking-wider px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                        title="You're not in the To header — CC, BCC, or list blast"
                      >
                        FYI
                      </span>
                    )}
                    <span className="truncate">
                      <span className={isUnread
                        ? 'font-semibold text-slate-900 dark:text-slate-50'
                        : 'font-normal text-slate-600 dark:text-slate-400'}>
                        {r.from_address?.split('<')[0].trim() || '—'}
                      </span>
                      <span className={isUnread
                        ? 'text-slate-700 dark:text-slate-300'
                        : 'text-slate-500 dark:text-slate-500'}>
                        {' · '}{r.subject || '(no subject)'}
                      </span>
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {r.account_display_name}
                    {r.received_at && ` · ${fmtCairoDateTime(r.received_at)}`}
                  </div>
                </div>
                {r.needs_review && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200 shrink-0">
                    review
                  </span>
                )}
              </li>
            );
          })}
          {!sortedRows.length && (
            <li className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No emails in this category yet.
            </li>
          )}
        </ul>
      </div>

      {/* Right column: preview pane */}
      <div className="lg:col-span-2 ix-card p-4 lg:sticky lg:top-4 self-start max-h-[80vh] overflow-y-auto">
        {selected ? (
          <PreviewPane email={selected} onClose={() => navTo(null)} />
        ) : (
          <EmptyPreview rowCount={rows.length} />
        )}
      </div>
    </div>
  );
}

function BulkBar({
  count, countLabel, pending, onArchive, onMarkRead, onClear,
  moveOpen, setMoveOpen, onMoveTo, currentCategory,
}: {
  count: number;
  // When set, appended to the count — e.g. "1,847 selected · all in
  // Beithady" — so the user can never confuse a page-select with a
  // whole-category select while the destructive action is one click away.
  countLabel?: string | null;
  pending: boolean;
  onArchive: () => void;
  onMarkRead: () => void;
  onClear: () => void;
  moveOpen: boolean;
  setMoveOpen: (b: boolean) => void;
  onMoveTo: (slug: CategorySlug) => void;
  currentCategory?: CategorySlug;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs">
      <span className="font-semibold text-slate-700 dark:text-slate-200">
        {count.toLocaleString()} selected{countLabel ? ` · ${countLabel}` : ''}
      </span>
      <button
        onClick={onMarkRead}
        disabled={pending}
        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
      >
        <CheckCircle size={12} /> Mark read
      </button>
      <button
        onClick={onArchive}
        disabled={pending}
        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
      >
        <Archive size={12} /> Archive
      </button>
      <div className="relative">
        <button
          onClick={() => setMoveOpen(!moveOpen)}
          disabled={pending}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
        >
          Move to <ChevronDown size={12} />
        </button>
        {moveOpen && (
          <div className="absolute z-20 left-0 mt-1 w-52 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1">
            {CATEGORIES.filter(c => c.slug !== currentCategory).map(c => (
              <button
                key={c.slug}
                onClick={() => onMoveTo(c.slug)}
                className="block w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {c.displayName}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        onClick={onClear}
        disabled={pending}
        className="inline-flex items-center gap-1 px-2 py-1 rounded text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 ml-auto"
      >
        <XIcon size={12} /> Clear
      </button>
      {pending && (
        <span className="text-[11px] text-slate-500">working…</span>
      )}
    </div>
  );
}

// Compact sort picker rendered at the right edge of the list header.
// Native <select> on purpose — pulling in a custom Combobox just for
// four options would dwarf the rest of the bar and break keyboard nav.
function SortDropdown({
  sortMode, setSortMode,
}: {
  sortMode: SortMode;
  setSortMode: (m: SortMode) => void;
}) {
  return (
    <label className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
      <span className="uppercase tracking-wide font-semibold">Sort</span>
      <select
        value={sortMode}
        onChange={e => setSortMode(e.target.value as SortMode)}
        className="text-[11px] px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 cursor-pointer hover:border-slate-400 dark:hover:border-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-400"
      >
        {(Object.keys(SORT_LABELS) as SortMode[]).map(m => (
          <option key={m} value={m}>{SORT_LABELS[m]}</option>
        ))}
      </select>
    </label>
  );
}

// Looks up the user-visible category name for the banner / count label.
// Falls back to the raw slug if the category was deleted from the
// CATEGORIES registry but rows still reference it (rare; defensive).
function categoryDisplayName(slug: CategorySlug | undefined): string {
  if (!slug) return 'this category';
  const cat = CATEGORIES.find(c => c.slug === slug);
  return cat?.displayName ?? slug;
}

function PreviewPane({ email, onClose }: { email: SelectedEmail; onClose: () => void }) {
  const cat = email.category ? CATEGORIES.find(c => c.slug === email.category) : null;
  const accent = cat?.accentColor ?? 'slate';
  const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${email.gmail_thread_id ?? email.gmail_message_id}`;
  const newReservation = isNewReservation(email.subject, email.category);
  const urgent = isImmediateIntervention(email.subject, email.category);
  const toPay = isInvoiceToBePaid(email.subject, email.category);
  const lowPriority = isLowPriority(email.to_address, email.account_email);

  const [htmlBody, setHtmlBody] = useState<string | null>(null);
  const [loadingHtml, setLoadingHtml] = useState(false);
  const [htmlError, setHtmlError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtmlBody(null);
    setHtmlError(null);
    setLoadingHtml(true);
    fetchEmailHtmlAction(email.id).then(res => {
      if (cancelled) return;
      setLoadingHtml(false);
      if (res.html) setHtmlBody(res.html);
      else setHtmlError(res.error ?? 'failed');
    }).catch(() => {
      if (!cancelled) { setLoadingHtml(false); setHtmlError('fetch_failed'); }
    });
    return () => { cancelled = true; };
  }, [email.id]);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {urgent && (
            <div className="mb-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-rose-600 text-white">
                ⚠ NEEDS ACTION
              </span>
            </div>
          )}
          {toPay && !urgent && (
            <div className="mb-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-yellow-500 text-black">
                💰 INVOICE TO PAY
              </span>
            </div>
          )}
          {newReservation && !urgent && !toPay && (
            <div className="mb-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-emerald-500 text-white">
                NEW RESERVATION
              </span>
            </div>
          )}
          {lowPriority && !urgent && !toPay && !newReservation && (
            <div className="mb-1.5">
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                title="You're not in the To header — CC/BCC/list blast"
              >
                FYI · NOT ADDRESSED TO YOU
              </span>
            </div>
          )}
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-50 leading-tight">
            {email.subject || '(no subject)'}
          </h3>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 space-y-0.5">
            <div className="truncate"><span className="font-mono">From:</span> {email.from_address}</div>
            <div className="truncate"><span className="font-mono">To:</span> {email.to_address}</div>
            {email.received_at && (
              <div><span className="font-mono">When:</span> {fmtCairoDateTime(email.received_at)}</div>
            )}
            <div>
              <span className="font-mono">Box:</span> {email.account_display_name ?? email.account_email}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          title="Close preview"
          className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 shrink-0"
        >
          <XIcon size={16} />
        </button>
      </div>

      <ClassificationStripe
        accent={accent}
        category={cat?.displayName ?? email.category ?? 'unclassified'}
        confidence={email.category_confidence}
        method={email.category_method}
        reason={email.category_reason}
        needsReview={email.needs_review}
      />

      <div className="flex items-center gap-2 flex-wrap text-[11px]">
        <Link
          href={`/personal/email/${email.id}`}
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <Mail size={12} /> Full page
        </Link>
        <a
          href={gmailUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ExternalLink size={12} /> Gmail
        </a>
      </div>

      <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
        <div className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400 mb-1">
          Email body
        </div>
        {loadingHtml && (
          <div className="text-[11px] text-slate-400 dark:text-slate-500 py-2">Loading…</div>
        )}
        {!loadingHtml && htmlBody && (
          <iframe
            srcDoc={htmlBody}
            sandbox="allow-same-origin allow-popups"
            className="w-full rounded border border-slate-200 dark:border-slate-700"
            style={{ minHeight: 320, height: 480 }}
            title="Email body"
          />
        )}
        {!loadingHtml && !htmlBody && (
          <pre className="whitespace-pre-wrap text-[12px] text-slate-700 dark:text-slate-200 font-sans leading-relaxed">
            {sanitizeBodyExcerptForDisplay(email.body_excerpt) || '(no body cached — open in Gmail)'}
          </pre>
        )}
      </div>
    </div>
  );
}

function ClassificationStripe({
  accent, category, confidence, method, reason, needsReview,
}: {
  accent: string;
  category: string;
  confidence: number | null;
  method: string | null;
  reason: string | null;
  needsReview: boolean;
}) {
  return (
    <div className={`rounded-md border-l-4 border-${accent}-500 bg-${accent}-50/40 dark:bg-${accent}-950/30 px-3 py-2`}>
      <div className="flex items-center gap-2 flex-wrap text-[11px]">
        <span className="font-semibold text-slate-900 dark:text-slate-50">{category}</span>
        {confidence !== null && (
          <span className="text-slate-600 dark:text-slate-300">conf {confidence.toFixed(2)}</span>
        )}
        {method && (
          <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
            {method}
          </span>
        )}
        {needsReview && (
          <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200">
            review
          </span>
        )}
      </div>
      {reason && (
        <div className="text-[11px] text-slate-600 dark:text-slate-300 italic mt-1">
          &quot;{reason}&quot;
        </div>
      )}
    </div>
  );
}

function EmptyPreview({ rowCount }: { rowCount: number }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 text-slate-500 dark:text-slate-400">
      <Inbox size={28} className="mb-2 opacity-60" />
      <p className="text-sm">
        {rowCount === 0
          ? 'Nothing to preview yet.'
          : 'Pick an email on the left to read it here.'}
      </p>
      {useMemo(() => null, [])}
    </div>
  );
}
