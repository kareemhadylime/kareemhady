'use client';

import { useTransition } from 'react';
import {
  Sparkles,
  RefreshCw,
  Loader2,
  AlertTriangle,
  ExternalLink,
  Wand2,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { generateAiInfoAction } from '../actions';
import type { AiItemInfoPayload, AiInfoStatus } from '@/lib/beithady/inventory/catalog';

// Per-item AI info card — rendered inside an expanded row on the items
// page. Three states:
//   • idle, ai_info present       → render the card + "Refresh" button
//   • idle, ai_info null          → "Generate AI info" CTA
//   • queued / running            → spinner placeholder
//   • error                       → red banner with the error + Retry button

export function AiInfoCard({
  itemId,
  itemSku,
  itemNameEn,
  amazonEgUrl,
  aiInfo,
  generatedAt,
  source,
  status,
  errorMsg,
  canEdit,
}: {
  itemId: string;
  itemSku: string;
  itemNameEn: string;
  amazonEgUrl: string | null;
  aiInfo: AiItemInfoPayload | null;
  generatedAt: string | null;
  source: 'amazon_eg_fetch' | 'general_knowledge' | null;
  status: AiInfoStatus;
  errorMsg: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function regen() {
    startTransition(async () => {
      await generateAiInfoAction(itemId);
      router.refresh();
    });
  }

  // queued/running — spinner placeholder
  if (status === 'queued' || status === 'running') {
    return (
      <div className="rounded-lg border border-cyan-200 dark:border-cyan-800 bg-cyan-50/40 dark:bg-cyan-950/20 p-4 text-xs text-cyan-700 dark:text-cyan-200 inline-flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" />
        <span>{status === 'queued' ? 'AI regen queued…' : 'Generating AI info card…'}</span>
        <span className="text-[10px] text-cyan-600/70 dark:text-cyan-300/70">
          (~5–10s · auto-refreshes when ready)
        </span>
      </div>
    );
  }

  // No card yet
  if (!aiInfo) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/40 dark:bg-slate-900/40 p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="text-xs text-slate-600 dark:text-slate-300 inline-flex items-center gap-2">
          <Sparkles size={14} className="text-cyan-500" />
          <span>No AI info card yet for <code className="font-mono">{itemSku}</code>.</span>
        </div>
        {canEdit && (
          <button
            type="button"
            disabled={pending}
            onClick={regen}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-600 text-white hover:bg-cyan-700 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {pending ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
            {pending ? 'Generating…' : 'Generate AI info'}
          </button>
        )}
      </div>
    );
  }

  // Error state — keep the previous card visible if we have one, but flag the failure
  const errorBanner = status === 'error' && errorMsg ? (
    <div className="rounded border border-rose-200 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-800 p-2 text-[11px] text-rose-700 dark:text-rose-200 inline-flex items-start gap-1.5">
      <AlertTriangle size={12} className="shrink-0 mt-0.5" />
      <span>Last regen failed: {errorMsg}</span>
    </div>
  ) : null;

  const generatedDateLabel = generatedAt
    ? new Date(generatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
    : null;

  const sourceLabel = source === 'amazon_eg_fetch' ? 'Amazon EG' : 'General knowledge';
  const sourceCls =
    source === 'amazon_eg_fetch'
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200'
      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300';

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 p-4 space-y-3 text-xs">
      {errorBanner}

      {/* Summaries */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium mb-1 inline-flex items-center gap-1">
            <Sparkles size={10} className="text-cyan-500" /> Summary
          </div>
          <p className="text-slate-800 dark:text-slate-100 leading-relaxed">{aiInfo.summary_en}</p>
        </div>
        <div dir="rtl">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium mb-1">
            ملخص
          </div>
          <p className="text-slate-800 dark:text-slate-100 leading-relaxed">{aiInfo.summary_ar}</p>
        </div>
      </div>

      {/* Features + tips */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium mb-1">
            Key features
          </div>
          <ul className="list-disc pl-4 space-y-0.5 text-slate-700 dark:text-slate-200">
            {aiInfo.key_features.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium mb-1">
            Usage tips
          </div>
          <p className="text-slate-700 dark:text-slate-200 leading-relaxed">{aiInfo.usage_tips}</p>
        </div>
      </div>

      {/* Ingredients / warnings / pack — three-up grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium mb-1">
            Ingredients / materials
          </div>
          <p className="text-slate-700 dark:text-slate-200">
            {aiInfo.ingredients_or_materials || <span className="text-slate-400">—</span>}
          </p>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-amber-600 dark:text-amber-300 font-medium mb-1">
            Warnings
          </div>
          <p className="text-slate-700 dark:text-slate-200">
            {aiInfo.warnings || <span className="text-slate-400">—</span>}
          </p>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium mb-1">
            Pack details
          </div>
          <p className="text-slate-700 dark:text-slate-200">{aiInfo.pack_details}</p>
        </div>
      </div>

      {/* Footer — source, model, refresh */}
      <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-500 dark:text-slate-400">
        <div className="inline-flex items-center gap-2 flex-wrap">
          <span className={`px-1.5 py-0.5 rounded font-medium ${sourceCls}`}>
            Source: {sourceLabel}
          </span>
          {aiInfo.source_url && (
            <a
              href={aiInfo.source_url}
              target="_blank"
              rel="noreferrer noopener"
              className="inline-flex items-center gap-1 hover:text-cyan-700 dark:hover:text-cyan-300"
              title={aiInfo.source_url}
            >
              View source <ExternalLink size={9} />
            </a>
          )}
          <span aria-hidden>·</span>
          <span>Generated {generatedDateLabel || '—'}</span>
          <span aria-hidden>·</span>
          <span>{aiInfo.model.replace('claude-', '').replace('-20251001', '')}</span>
          {amazonEgUrl && source === 'general_knowledge' && (
            <>
              <span aria-hidden>·</span>
              <span className="text-amber-600 dark:text-amber-300" title="Amazon EG fetch failed; AI used general housekeeping knowledge instead">
                Fallback used
              </span>
            </>
          )}
        </div>
        {canEdit && (
          <button
            type="button"
            disabled={pending}
            onClick={regen}
            className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] text-cyan-700 dark:text-cyan-300 hover:bg-cyan-50 dark:hover:bg-cyan-950/40 disabled:opacity-50"
            title={`Re-generate the AI card for ${itemNameEn}`}
          >
            {pending ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
            {pending ? 'Refreshing…' : 'Refresh AI info'}
          </button>
        )}
      </div>
    </div>
  );
}
