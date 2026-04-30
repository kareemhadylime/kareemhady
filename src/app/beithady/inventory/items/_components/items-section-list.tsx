'use client';

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import { AlertCircle, Check, ChevronDown, ChevronRight, Loader2, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { Category, ItemListRow, Uom } from '@/lib/beithady/inventory/catalog';
import { ItemFormButton } from './item-form-button';
import { SourceCell } from './source-cell';
import { AiInfoCard } from './ai-info-card';
import { acceptManySourcesAction } from '../actions';

// Sectioned items list — one collapsible <table> per category, plus the
// bulk-review checkbox state and sticky action bar that operate across
// every row regardless of section.

type GroupedSection = {
  category: Category;
  items: ItemListRow[];
};

export function ItemsSectionList({
  sections,
  categories,
  uoms,
  canWrite,
}: {
  sections: GroupedSection[];
  categories: Category[];
  uoms: Uom[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Auto-refresh while any row is in the queued/running state — the
  // Vercel waitUntil() background regen has no client push channel,
  // so we poll the page every 4 s while a spinner is on screen.
  useEffect(() => {
    const anyInFlight = sections.some(s =>
      s.items.some(it => it.ai_info_status === 'queued' || it.ai_info_status === 'running'),
    );
    if (!anyInFlight) return;
    const t = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(t);
  }, [sections, router]);

  // Hash-anchor scroll-and-flash for deep links from estimator detail pages.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#item-')) return;
    const el = document.getElementById(hash.slice(1));
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ix-flash-highlight');
    const t = window.setTimeout(() => el.classList.remove('ix-flash-highlight'), 2400);
    return () => window.clearTimeout(t);
  }, []);

  // Build per-id lookups so we can compute "eligible to accept" without
  // re-walking every section on every render.
  const allItemsById = useMemo(() => {
    const m = new Map<string, ItemListRow>();
    for (const s of sections) for (const it of s.items) m.set(it.id, it);
    return m;
  }, [sections]);

  const eligibleSelected = useMemo(() => {
    let n = 0;
    for (const id of selected) {
      const it = allItemsById.get(id);
      if (it && it.amazon_eg_url) n++;
    }
    return n;
  }, [selected, allItemsById]);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSection(items: ItemListRow[], allChecked: boolean) {
    setSelected(prev => {
      const next = new Set(prev);
      for (const it of items) {
        if (allChecked) next.delete(it.id);
        else next.add(it.id);
      }
      return next;
    });
  }

  function clearAll() {
    setSelected(new Set());
    setBulkError(null);
    setBulkResult(null);
  }

  function handleBulkAccept() {
    setBulkError(null);
    setBulkResult(null);
    startTransition(async () => {
      const ids = Array.from(selected);
      const res = await acceptManySourcesAction(ids);
      if (res.ok) {
        setBulkResult(
          `Accepted ${res.accepted}${res.skipped > 0 ? ` · skipped ${res.skipped} without URL` : ''}.`,
        );
        setSelected(new Set());
        router.refresh();
      } else {
        setBulkError(res.error);
      }
    });
  }

  return (
    <>
      {/* Sticky bulk action bar */}
      {selected.size > 0 && (
        <div className="sticky top-0 z-30 -mx-2 mb-3">
          <div className="ix-card border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 p-3 flex items-center justify-between gap-3 flex-wrap shadow-sm">
            <div className="text-xs text-emerald-900 dark:text-emerald-100 inline-flex items-center gap-2">
              <Check size={14} strokeWidth={3} />
              <strong>{selected.size}</strong> item{selected.size === 1 ? '' : 's'} selected
              {eligibleSelected !== selected.size && (
                <span className="text-amber-700 dark:text-amber-300 inline-flex items-center gap-1 text-[11px]">
                  <AlertCircle size={11} />
                  {selected.size - eligibleSelected} have no URL — will be skipped
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {bulkResult && (
                <span className="text-[11px] text-emerald-700 dark:text-emerald-200">{bulkResult}</span>
              )}
              {bulkError && (
                <span className="text-[11px] text-rose-700 dark:text-rose-200 inline-flex items-center gap-1">
                  <AlertCircle size={11} /> {bulkError}
                </span>
              )}
              <button
                type="button"
                onClick={clearAll}
                className="px-2.5 py-1 text-[11px] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white inline-flex items-center gap-1"
              >
                <X size={12} /> Clear
              </button>
              <button
                type="button"
                disabled={pending || eligibleSelected === 0}
                onClick={handleBulkAccept}
                className="px-3 py-1.5 text-[11px] font-medium bg-emerald-600 text-white rounded hover:bg-emerald-700 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {pending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} strokeWidth={3} />}
                Accept {eligibleSelected} selected
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sections */}
      {sections.length === 0 ? (
        <div className="ix-card p-10 text-center text-sm text-slate-500 dark:text-slate-300">
          <p>No items match your filter.</p>
          {canWrite && (
            <p className="text-[11px] mt-2">
              Use <strong>Add item</strong> for manual entry, or <strong>Excel template</strong> + <strong>Import from Excel</strong> for bulk.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {sections.map(s => (
            <CategorySection
              key={s.category.id}
              section={s}
              categories={categories}
              uoms={uoms}
              canWrite={canWrite}
              selected={selected}
              onToggle={toggle}
              onToggleSection={toggleSection}
              expandedId={expandedId}
              onToggleExpand={(id) => setExpandedId(prev => (prev === id ? null : id))}
            />
          ))}
        </div>
      )}
    </>
  );
}

function CategorySection({
  section,
  categories,
  uoms,
  canWrite,
  selected,
  onToggle,
  onToggleSection,
  expandedId,
  onToggleExpand,
}: {
  section: GroupedSection;
  categories: Category[];
  uoms: Uom[];
  canWrite: boolean;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleSection: (items: ItemListRow[], allChecked: boolean) => void;
  expandedId: string | null;
  onToggleExpand: (id: string) => void;
}) {
  const sectionAllChecked =
    section.items.length > 0 && section.items.every(it => selected.has(it.id));
  const sectionSomeChecked =
    section.items.some(it => selected.has(it.id)) && !sectionAllChecked;

  // Quick stats per section
  const totalCount = section.items.length;
  const sourcedCount = section.items.filter(it => it.amazon_eg_url).length;
  const reviewedCount = section.items.filter(it => it.amazon_eg_url_reviewed_at).length;

  return (
    <section id={`cat-${section.category.code}`} className="space-y-2 scroll-mt-24">
      <div className="flex items-baseline justify-between flex-wrap gap-2">
        <h2
          className="text-sm font-semibold uppercase tracking-wide"
          style={{ color: 'var(--bh-heading)' }}
        >
          {section.category.name_en}
        </h2>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 inline-flex items-center gap-2">
          <span>{totalCount} item{totalCount === 1 ? '' : 's'}</span>
          <span aria-hidden>·</span>
          <span>{sourcedCount} sourced</span>
          <span aria-hidden>·</span>
          <span className={reviewedCount === sourcedCount && sourcedCount > 0 ? 'text-emerald-700 dark:text-emerald-300' : ''}>
            {reviewedCount} reviewed
          </span>
        </div>
      </div>

      <div className="ix-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/40 text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-300">
              <tr>
                {canWrite && (
                  <th className="px-2 py-2 w-8">
                    <input
                      type="checkbox"
                      aria-label={`Select all ${section.category.name_en}`}
                      checked={sectionAllChecked}
                      ref={el => {
                        if (el) el.indeterminate = sectionSomeChecked;
                      }}
                      onChange={() => onToggleSection(section.items, sectionAllChecked)}
                      className="rounded"
                    />
                  </th>
                )}
                <th className="px-1 py-2 w-6" aria-label="Expand"></th>
                <th className="text-left px-3 py-2">SKU</th>
                <th className="text-left px-3 py-2">Name</th>
                <th className="text-left px-3 py-2">UoM</th>
                <th className="text-right px-3 py-2 whitespace-nowrap">On hand</th>
                <th className="text-right px-3 py-2">Min</th>
                <th className="text-right px-3 py-2 whitespace-nowrap">Cost (EGP)</th>
                <th className="text-left px-3 py-2 whitespace-nowrap">Source</th>
                <th className="text-left px-3 py-2">Flags</th>
                <th className="text-right px-3 py-2">{canWrite && 'Edit'}</th>
              </tr>
            </thead>
            <tbody>
              {section.items.map(it => (
                <ItemRow
                  key={it.id}
                  it={it}
                  categories={categories}
                  uoms={uoms}
                  canWrite={canWrite}
                  checked={selected.has(it.id)}
                  onToggle={() => onToggle(it.id)}
                  expanded={expandedId === it.id}
                  onToggleExpand={() => onToggleExpand(it.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function ItemRow({
  it,
  categories,
  uoms,
  canWrite,
  checked,
  onToggle,
  expanded,
  onToggleExpand,
}: {
  it: ItemListRow;
  categories: Category[];
  uoms: Uom[];
  canWrite: boolean;
  checked: boolean;
  onToggle: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  // 1 (chevron) + 8 base + 1 if canWrite (checkbox) + 1 (edit) — keep in
  // sync with the <thead> column count above. The expanded-detail <tr>
  // spans this width so the AI info card fills the row.
  const colSpan = (canWrite ? 1 : 0) + 1 + 8 + 1;

  return (
    <>
    <tr
      id={`item-${it.id}`}
      className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition"
    >
      {canWrite && (
        <td className="px-2 py-2">
          <input
            type="checkbox"
            aria-label={`Select ${it.sku}`}
            checked={checked}
            onChange={onToggle}
            className="rounded"
          />
        </td>
      )}
      <td className="px-1 py-2">
        <button
          type="button"
          onClick={onToggleExpand}
          aria-label={expanded ? 'Collapse' : 'Expand'}
          aria-expanded={expanded}
          className="text-slate-400 hover:text-cyan-600 dark:hover:text-cyan-300 inline-flex items-center justify-center w-5 h-5"
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
      </td>
      <td className="px-3 py-2 font-mono text-[11px]">{it.sku}</td>
      <td className="px-3 py-2">
        <div className="font-medium">{it.name_en}</div>
        <div className="text-[10px] text-slate-500 dark:text-slate-400" dir="rtl">
          {it.name_ar}
        </div>
        {it.brand && <div className="text-[10px] text-slate-400">{it.brand}</div>}
      </td>
      <td className="px-3 py-2 text-[11px]">{it.uom}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        <span
          className={
            it.total_on_hand === 0
              ? 'text-rose-600 font-semibold'
              : it.total_on_hand < it.min_qty
                ? 'text-amber-700 font-semibold'
                : ''
          }
        >
          {Number(it.total_on_hand).toLocaleString('en-US', { maximumFractionDigits: 1 })}
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{it.min_qty}</td>
      <td className="px-3 py-2 text-right tabular-nums">
        <CostCell item={it} />
      </td>
      <td className="px-3 py-2">
        <SourceCell
          itemId={it.id}
          itemSku={it.sku}
          itemNameEn={it.name_en}
          amazonEgUrl={it.amazon_eg_url}
          reviewedAt={it.amazon_eg_url_reviewed_at}
          reviewedByName={it.amazon_eg_url_reviewed_by_name}
          canEdit={canWrite}
        />
      </td>
      <td className="px-3 py-2 text-[10px]">
        <div className="flex flex-wrap gap-1">
          {it.batch_tracked && <Pill tone="violet">Batch</Pill>}
          {it.expiry_tracked && <Pill tone="rose">Expiry</Pill>}
          {it.owner_billable && <Pill tone="amber">Owner</Pill>}
          {it.is_asset && <Pill tone="cyan">Asset</Pill>}
          {!it.active && <Pill tone="slate">Inactive</Pill>}
        </div>
      </td>
      <td className="px-3 py-2 text-right">
        {canWrite && (
          <ItemFormButton
            mode="edit"
            existing={it}
            categories={categories}
            uoms={uoms}
            triggerLabel="Edit"
            triggerClass="text-[11px] text-cyan-700 dark:text-cyan-300 hover:underline"
          />
        )}
      </td>
    </tr>
    {expanded && (
      <tr className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-900/30">
        <td colSpan={colSpan} className="px-4 py-3">
          <AiInfoCard
            itemId={it.id}
            itemSku={it.sku}
            itemNameEn={it.name_en}
            amazonEgUrl={it.amazon_eg_url}
            aiInfo={it.ai_info}
            generatedAt={it.ai_info_generated_at}
            source={it.ai_info_source}
            status={it.ai_info_status}
            errorMsg={it.ai_info_error}
            canEdit={canWrite}
          />
        </td>
      </tr>
    )}
    </>
  );
}

function CostCell({ item }: { item: ItemListRow }) {
  // Live price = amazon_eg_price_egp / pack_size  (matches estimator.ts)
  // Estimate    = default_cost_egp (the seeded placeholder)
  const livePrice = (() => {
    if (item.amazon_eg_price_egp == null) return null;
    const ps = item.amazon_eg_pack_size && item.amazon_eg_pack_size > 0 ? item.amazon_eg_pack_size : 1;
    return item.amazon_eg_price_egp / ps;
  })();
  const isEstimate = livePrice == null;
  const displayValue = livePrice ?? Number(item.default_cost_egp);
  const formatted = displayValue.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const lastChecked = item.amazon_eg_last_checked_at
    ? new Date(item.amazon_eg_last_checked_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    : null;

  if (isEstimate) {
    return (
      <span
        className="text-amber-700 dark:text-amber-300"
        title="Estimate — seeded placeholder. Set an Amazon EG URL and run the price sourcer to get the live price."
      >
        ~{formatted}
      </span>
    );
  }
  return (
    <span
      className="text-slate-700 dark:text-slate-100"
      title={lastChecked ? `Live Amazon EG price · checked ${lastChecked}` : 'Live Amazon EG price'}
    >
      {formatted}
    </span>
  );
}

function Pill({ tone, children }: { tone: 'violet' | 'rose' | 'amber' | 'cyan' | 'slate'; children: ReactNode }) {
  const cls =
    tone === 'violet'
      ? 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-200'
      : tone === 'rose'
        ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-200'
        : tone === 'amber'
          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-200'
          : tone === 'cyan'
            ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-200'
            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300';
  return <span className={`px-1 py-0.5 rounded ${cls}`}>{children}</span>;
}
