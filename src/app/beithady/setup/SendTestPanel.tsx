'use client';

import { useActionState } from 'react';
import { Loader2, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { sendTestNowStateAction, type SendTestResult } from './actions';

// Client component for the "Send Test Report Now" button. Uses React
// 19's useActionState so the user sees:
//   1. Idle → click triggers immediate `Sending...` with spinner
//   2. Pending → button disabled, message says "Building report and
//      delivering — this can take 30-60s"
//   3. Result → success or error banner inline; on success a clickable
//      preview link
// No redirect needed; result lives in component state until the next
// click clears it.

export function SendTestPanel() {
  const [state, formAction, isPending] = useActionState<
    SendTestResult | null,
    FormData
  >(sendTestNowStateAction, null);

  return (
    <div className="mt-5 border-t border-slate-200 dark:border-slate-700 pt-4">
      <form action={formAction} className="flex items-center gap-3 flex-wrap">
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-md bg-[#1e3a5f] dark:bg-[#1e3a5f] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1a2c47] disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending…
            </>
          ) : (
            'Send Test Report Now'
          )}
        </button>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Builds today&apos;s report and delivers to recipients matching your username/whatsapp
          (or all active if none match). Skips the 9 AM gate. Takes 30–60s.
        </p>
      </form>

      {/* Pending banner */}
      {isPending && (
        <div
          role="status"
          className="mt-3 flex items-start gap-2 rounded-md border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"
        >
          <Loader2 className="h-4 w-4 mt-0.5 animate-spin shrink-0" />
          <div>
            <strong>Processing…</strong> building today&apos;s payload (Guesty + PriceLabs + Stripe + Haiku review summaries), rendering the PDF, and pushing to WhatsApp + Email. Please don&apos;t close this tab.
          </div>
        </div>
      )}

      {/* Success */}
      {!isPending && state?.ok && (
        <div className="mt-3 rounded-md border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 px-3 py-2 text-sm">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
            <div className="flex-1">
              <strong className="text-emerald-900 dark:text-emerald-200">
                Test report delivered
              </strong>
              <div className="text-xs text-emerald-800 dark:text-emerald-300 mt-0.5">
                Attempted: {state.attempted} · Sent: {state.sent}{' '}
                {state.failed > 0 ? `· Failed: ${state.failed}` : ''}
              </div>
              {state.errors.length > 0 && (
                <ul className="mt-1 text-xs text-rose-800 dark:text-rose-300 list-disc list-inside">
                  {state.errors.map((e, i) => (
                    <li key={i}>
                      {e.channel}: {e.error}
                    </li>
                  ))}
                </ul>
              )}
              <a
                href={state.preview_link}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300 hover:underline"
              >
                Open browser preview <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {!isPending && state && !state.ok && (
        <div className="mt-3 rounded-md border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 px-3 py-2 text-sm">
          <div className="flex items-start gap-2">
            <XCircle className="h-4 w-4 mt-0.5 text-rose-700 dark:text-rose-400 shrink-0" />
            <div>
              <strong className="text-rose-900 dark:text-rose-200">
                Test failed
              </strong>
              <div className="text-xs text-rose-800 dark:text-rose-300 mt-0.5 font-mono">
                {state.error}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
