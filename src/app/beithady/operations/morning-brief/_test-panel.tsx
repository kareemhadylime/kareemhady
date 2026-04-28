'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle2, AlertCircle, Eye, Send, UserCheck } from 'lucide-react';
import {
  previewBriefAction,
  sendBriefNowAction,
  sendTestToMeAction,
  type TestResult,
} from './actions';
import type { BriefRole } from '@/lib/beithady/morning-brief/types';

type Action = 'preview' | 'send_all' | 'send_to_me' | null;

export function TestPanel({ role, dateIso }: { role: BriefRole; dateIso: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<Action>(null);
  const [result, setResult] = useState<TestResult | null>(null);

  const run = (action: Action) => {
    setActiveAction(action);
    setResult(null);
    startTransition(async () => {
      try {
        let r: TestResult;
        if (action === 'preview') {
          r = await previewBriefAction({ role, dateIso });
        } else if (action === 'send_all') {
          if (!confirm(`Send the ${role.replace('_', ' ')} brief NOW to all configured recipients (auto-broadcast + extras)? This will create a delivery log entry for ${dateIso}.`)) {
            setActiveAction(null);
            return;
          }
          r = await sendBriefNowAction({ role, dateIso });
          if (r.ok) router.refresh();
        } else if (action === 'send_to_me') {
          r = await sendTestToMeAction({ role, dateIso });
        } else {
          return;
        }
        setResult(r);
      } catch (e) {
        setResult({
          ok: false,
          duration_ms: 0,
          error: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setActiveAction(null);
      }
    });
  };

  return (
    <section className="ix-card p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-slate-500 mr-1">Test:</span>
        <button
          type="button"
          onClick={() => run('preview')}
          disabled={pending}
          className="ix-btn-secondary !text-xs"
        >
          {pending && activeAction === 'preview'
            ? <Loader2 size={12} className="animate-spin" />
            : <Eye size={12} />}
          Preview only
        </button>
        <button
          type="button"
          onClick={() => run('send_to_me')}
          disabled={pending}
          className="ix-btn-secondary !text-xs"
        >
          {pending && activeAction === 'send_to_me'
            ? <Loader2 size={12} className="animate-spin" />
            : <UserCheck size={12} />}
          Send test to me
        </button>
        <button
          type="button"
          onClick={() => run('send_all')}
          disabled={pending}
          className="ix-btn-primary !text-xs"
        >
          {pending && activeAction === 'send_all'
            ? <Loader2 size={12} className="animate-spin" />
            : <Send size={12} />}
          Send NOW to all recipients
        </button>
        <span className="text-[10px] text-slate-400 ml-auto">
          Date: {dateIso}
        </span>
      </div>

      {/* Processing indicator */}
      {pending && (
        <div className="border-l-4 border-cyan-500 bg-cyan-50/60 dark:bg-cyan-900/10 p-2 flex items-center gap-2 text-[11px] text-cyan-900 dark:text-cyan-200">
          <Loader2 size={12} className="animate-spin" />
          <span>
            {activeAction === 'preview' && 'Building brief…'}
            {activeAction === 'send_to_me' && 'Sending test to your WhatsApp…'}
            {activeAction === 'send_all' && 'Sending to all recipients…'}
          </span>
        </div>
      )}

      {/* Result panel */}
      {result && !pending && (
        <ResultPanel result={result} />
      )}
    </section>
  );
}

function ResultPanel({ result }: { result: TestResult }) {
  if (!result.ok) {
    return (
      <div className="border-l-4 border-rose-500 bg-rose-50/60 dark:bg-rose-900/10 p-2 space-y-1 text-[11px] text-rose-900 dark:text-rose-200">
        <div className="flex items-center gap-1.5 font-semibold">
          <AlertCircle size={12} />
          Failed in {result.duration_ms}ms
        </div>
        <div className="break-words">{result.error}</div>
        {result.errors && result.errors.length > 0 && (
          <ul className="list-disc list-inside space-y-0.5 mt-1">
            {result.errors.map((e, i) => (
              <li key={i}>
                <span className="font-medium">{e.recipient}</span> · {e.channel} · {e.error}
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
  return (
    <div className="border-l-4 border-emerald-500 bg-emerald-50/60 dark:bg-emerald-900/10 p-2 space-y-1 text-[11px] text-emerald-900 dark:text-emerald-200">
      <div className="flex items-center gap-1.5 font-semibold">
        <CheckCircle2 size={12} />
        Success in {result.duration_ms}ms
      </div>
      {(result.recipients != null || result.delivered_whatsapp != null) && (
        <div className="text-[10px] text-emerald-800 dark:text-emerald-300 flex flex-wrap items-center gap-3">
          {result.recipients != null && <span>Recipients: {result.recipients}</span>}
          {result.delivered_whatsapp != null && <span>WhatsApp: {result.delivered_whatsapp}</span>}
          {result.delivered_email != null && <span>Email: {result.delivered_email}</span>}
          {result.failed != null && result.failed > 0 && (
            <span className="text-rose-700 dark:text-rose-300">Failed: {result.failed}</span>
          )}
        </div>
      )}
      {result.summary && (
        <details className="text-[10px] mt-1">
          <summary className="cursor-pointer text-emerald-700 dark:text-emerald-300">Brief summary</summary>
          <ul className="mt-1 ml-4 list-disc">
            {Object.entries(result.summary).map(([k, v]) => (
              <li key={k}>{k}: <span className="tabular-nums">{v}</span></li>
            ))}
          </ul>
        </details>
      )}
      {result.preview_html && (
        <details className="text-[10px] mt-1">
          <summary className="cursor-pointer text-emerald-700 dark:text-emerald-300">Preview HTML</summary>
          <iframe
            srcDoc={result.preview_html}
            className="w-full h-96 mt-2 border border-slate-200 dark:border-slate-700 rounded bg-white"
            title="Brief preview"
          />
        </details>
      )}
      {result.errors && result.errors.length > 0 && (
        <details className="text-[10px] mt-1">
          <summary className="cursor-pointer text-amber-700 dark:text-amber-300">Partial errors ({result.errors.length})</summary>
          <ul className="list-disc list-inside space-y-0.5 mt-1">
            {result.errors.map((e, i) => (
              <li key={i}>{e.recipient} · {e.channel} · {e.error}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
