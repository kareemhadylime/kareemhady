'use client';

import { useState, useTransition, useMemo } from 'react';
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
} from '../actions';
import { CATEGORIES } from '@/lib/personal-email/categories';
import type { CategorySlug } from '@/lib/personal-email/types';
import type { InboxRow } from '@/lib/personal-email/inbox-query';
import { isNewReservation, isImmediateIntervention, isInvoiceToBePaid, markerTier } from '@/lib/personal-email/email-helpers';

// Master-detail drill-down: list on the left, preview on the right.
// Selected email lives in URL as `?msg=<id>` so deep links work and
// server can pre-render the preview. Multi-select state is local
// (Set<string>) and powers the bulk-action bar at the top of the list.

export type SelectedEmail = {
  id: string;
  subject: string | null;
  from_address: string | null;
  to_address: string | null;
  received_at: string | null;
  body_excerpt: string | null;
  category: CategorySlug | null;
  category_confidence: number | null;
  category_method: string | null;
  category_reason: string | null;
  needs_review: boolean;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  account_display_name: string | null;
  account_email: string | null;
};

export function DrillDownView({
  rows,
  selected,
  category,
}: {
  rows: InboxRow[];
  selected: SelectedEmail | null;
  category: CategorySlug;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [moveOpen, setMoveOpen] = useState(false);

  // Sort marked-and-still-active rows to the top, normal rows below.
  // "Active" = the marker pattern matches AND the user hasn't taken
  // an action yet (not read, not archived, not manually moved). Once
  // the user reads/archives/moves, the row drops to natural date
  // order on next refresh.
  const sortedRows = useMemo(() => {
    const scored = rows.map(r => ({
      r,
      tier: markerTier(r),
      ts: r.received_at ? Date.parse(r.received_at) : 0,
    }));
    scored.sort((a, b) => {
      // Lower tier number = higher precedence (urgent=0 wins over to-pay=1).
      if (a.tier !== b.tier) return a.tier - b.tier;
      return b.ts - a.ts;
    });
    return scored.map(s => s.r);
  }, [rows]);

  const allChecked = sortedRows.length > 0 && sortedRows.every(r => checked.has(r.id));
  const anyChecked = checked.size > 0;

  function navTo(id: string | null) {
    const params = new URLSearchParams(sp.toString());
    if (id) params.set('msg', id);
    else params.delete('msg');
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

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
  }

  function onArchive() {
    const ids = [...checked];
    if (!ids.length) return;
    start(async () => {
      await archiveInGmail(ids);
      clearSelection();
    });
  }

  function onMarkRead() {
    const ids = [...checked];
    if (!ids.length) return;
    start(async () => {
      await markAsRead(ids);
      clearSelection();
    });
  }

  function onMoveTo(target: CategorySlug) {
    const ids = [...checked];
    if (!ids.length) return;
    setMoveOpen(false);
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
              count={checked.size}
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
              {rows.length} email{rows.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        <ul className="divide-y divide-slate-100 dark:divide-slate-800 max-h-[70vh] overflow-y-auto">
          {sortedRows.map(r => {
            const isSelected = selected?.id === r.id;
            const isChecked = checked.has(r.id);
            const newReservation = isNewReservation(r.subject, r.category);
            const urgent = isImmediateIntervention(r.subject, r.category);
            const toPay = isInvoiceToBePaid(r.subject, r.category);
            // Precedence: urgent > toPay > newReservation (each color
            // signals more time-criticality than the next).
            const rowAccentClass = urgent
              ? 'bg-rose-50/40 dark:bg-rose-950/15 hover:bg-rose-50/70 dark:hover:bg-rose-950/35'
              : toPay
                ? 'bg-yellow-50/40 dark:bg-yellow-950/15 hover:bg-yellow-50/70 dark:hover:bg-yellow-950/35'
                : newReservation
                  ? 'bg-emerald-50/30 dark:bg-emerald-950/10 hover:bg-emerald-50/60 dark:hover:bg-emerald-950/30'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-900/40';
            return (
              <li
                key={r.id}
                className={`flex items-start gap-2 px-3 py-2 transition cursor-pointer ${
                  isSelected
                    ? 'bg-slate-100 dark:bg-slate-800/70'
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
                    <span className="truncate">
                      <span className="font-semibold text-slate-900 dark:text-slate-50">
                        {r.from_address?.split('<')[0].trim() || '—'}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">
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
  count, pending, onArchive, onMarkRead, onClear,
  moveOpen, setMoveOpen, onMoveTo, currentCategory,
}: {
  count: number;
  pending: boolean;
  onArchive: () => void;
  onMarkRead: () => void;
  onClear: () => void;
  moveOpen: boolean;
  setMoveOpen: (b: boolean) => void;
  onMoveTo: (slug: CategorySlug) => void;
  currentCategory: CategorySlug;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap text-xs">
      <span className="font-semibold text-slate-700 dark:text-slate-200">
        {count} selected
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

function PreviewPane({ email, onClose }: { email: SelectedEmail; onClose: () => void }) {
  const cat = email.category ? CATEGORIES.find(c => c.slug === email.category) : null;
  const accent = cat?.accentColor ?? 'slate';
  const gmailUrl = `https://mail.google.com/mail/u/0/#inbox/${email.gmail_thread_id ?? email.gmail_message_id}`;
  const newReservation = isNewReservation(email.subject, email.category);
  const urgent = isImmediateIntervention(email.subject, email.category);
  const toPay = isInvoiceToBePaid(email.subject, email.category);

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
          Body excerpt
        </div>
        <pre className="whitespace-pre-wrap text-[12px] text-slate-700 dark:text-slate-200 font-sans leading-relaxed">
          {email.body_excerpt ?? '(no body cached — open in Gmail)'}
        </pre>
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
