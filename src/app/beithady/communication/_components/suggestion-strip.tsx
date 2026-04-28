'use client';
import { useState } from 'react';
import { Sparkles, Send, Edit3, X, RefreshCw, AlertTriangle, Check } from 'lucide-react';
import { acceptSuggestionAction, dismissSuggestionAction, regenerateSuggestionAction } from '../ai-actions';

// AI suggestion strip rendered above the composer when there's a
// pending suggested-reply for this conversation. Three actions:
//   - Send as-is (one click → sends + logs agent_action='sent_as_is')
//   - Edit (copies to composer for tweaking before send)
//   - Dismiss (logs agent_action='dismissed', strip disappears)
//   - Regenerate (re-classifies, costs ~$0.001)

export type Suggestion = {
  log_id: string;
  classification: string;
  confidence: number;
  suggested_reply: string;
  language: string;
};

const CLASSIFICATION_BADGE: Record<string, string> = {
  inquiry: 'bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-200',
  check_in: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200',
  check_out: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200',
  wifi: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-200',
  amenities: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-200',
  directions: 'bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-200',
  house_rules: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200',
  cleaning: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200',
  maintenance: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-200',
  complaint: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200',
  refund: 'bg-rose-100 text-rose-700 dark:bg-rose-900 dark:text-rose-200',
  urgent: 'bg-rose-200 text-rose-800 dark:bg-rose-800 dark:text-rose-100',
  thanks: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-200',
  review_ask: 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200',
  small_talk: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  other: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
};

export function SuggestionStrip({
  conversationId,
  suggestion,
  onCopyToComposer,
  channel,
}: {
  conversationId: string;
  suggestion: Suggestion;
  onCopyToComposer?: (body: string) => void;
  channel: 'guesty' | 'wa_cloud' | 'wa_casual';
}) {
  const [busy, setBusy] = useState<'send' | 'dismiss' | 'regen' | null>(null);
  const isHighRisk = ['complaint', 'refund', 'urgent'].includes(suggestion.classification);

  return (
    <div className={`rounded-lg border p-3 space-y-2 ${
      isHighRisk
        ? 'border-rose-200 bg-rose-50 dark:bg-rose-950 dark:border-rose-800'
        : 'border-violet-200 bg-violet-50 dark:bg-violet-950 dark:border-violet-800'
    }`}>
      <div className="flex items-center gap-2 flex-wrap text-xs">
        <Sparkles size={12} className={isHighRisk ? 'text-rose-600' : 'text-violet-600'} />
        <span className="font-semibold">AI suggestion</span>
        <span className={`uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded text-[10px] ${CLASSIFICATION_BADGE[suggestion.classification] || CLASSIFICATION_BADGE.other}`}>
          {suggestion.classification.replace('_', ' ')}
        </span>
        <span className="text-slate-600 dark:text-slate-300">
          confidence <span className="font-mono font-bold">{(suggestion.confidence * 100).toFixed(0)}%</span>
        </span>
        <span className="text-slate-500 uppercase">{suggestion.language}</span>
        {isHighRisk && (
          <span className="inline-flex items-center gap-1 text-rose-700 dark:text-rose-300 font-semibold ml-auto">
            <AlertTriangle size={11} /> Agent review required
          </span>
        )}
      </div>

      <div className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed bg-white dark:bg-slate-900 rounded p-2 border border-slate-200 dark:border-slate-700">
        {suggestion.suggested_reply}
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {channel !== 'guesty' && (
          <form action={acceptSuggestionAction} className="inline">
            <input type="hidden" name="log_id" value={suggestion.log_id} />
            <input type="hidden" name="conversation_id" value={conversationId} />
            <button
              type="submit"
              disabled={busy !== null}
              onClick={() => setBusy('send')}
              className="ix-btn-primary text-xs disabled:opacity-50"
            >
              <Send size={12} /> {busy === 'send' ? 'Sending…' : 'Send as-is'}
            </button>
          </form>
        )}
        {onCopyToComposer && (
          <button
            type="button"
            onClick={() => onCopyToComposer(suggestion.suggested_reply)}
            className="ix-btn-secondary text-xs"
          >
            <Edit3 size={12} /> Edit & send
          </button>
        )}
        <form action={regenerateSuggestionAction} className="inline">
          <input type="hidden" name="log_id" value={suggestion.log_id} />
          <input type="hidden" name="conversation_id" value={conversationId} />
          <button
            type="submit"
            disabled={busy !== null}
            onClick={() => setBusy('regen')}
            className="ix-btn-secondary text-xs disabled:opacity-50"
          >
            <RefreshCw size={12} /> {busy === 'regen' ? 'Regenerating…' : 'Regenerate'}
          </button>
        </form>
        <form action={dismissSuggestionAction} className="inline ml-auto">
          <input type="hidden" name="log_id" value={suggestion.log_id} />
          <input type="hidden" name="conversation_id" value={conversationId} />
          <button
            type="submit"
            disabled={busy !== null}
            onClick={() => setBusy('dismiss')}
            className="ix-btn-ghost text-xs disabled:opacity-50"
          >
            <X size={12} /> Dismiss
          </button>
        </form>
      </div>

      {channel === 'guesty' && (
        <p className="text-[10px] text-slate-500 flex items-center gap-1">
          <Check size={10} /> Guesty channel: AI auto-send disabled by policy. Edit & send via the composer.
        </p>
      )}
    </div>
  );
}
