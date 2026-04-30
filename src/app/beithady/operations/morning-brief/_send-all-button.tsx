'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, CheckCircle2, AlertCircle, Send } from 'lucide-react';
import { sendAllBriefsNowAction } from './actions';

type RoleResult = {
  role: 'guest_relations' | 'ops' | 'finance';
  ok: boolean;
  recipients: number;
  delivered_whatsapp: number;
  delivered_email: number;
  failed: number;
  error?: string;
};

const ROLE_LABEL: Record<RoleResult['role'], string> = {
  guest_relations: '🛎 Guest Relations',
  ops: '🛠 Ops',
  finance: '💰 Finance',
};

export function SendAllBriefsButton({ dateIso }: { dateIso: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    ok: boolean;
    duration_ms: number;
    per_role: RoleResult[];
    error?: string;
  } | null>(null);

  const run = () => {
    if (!confirm(`Send ALL 3 briefs (GR + Ops + Finance) NOW for ${dateIso} to all configured recipients?\n\nThis will wipe today's delivery log and re-send with the latest code.`)) return;
    setResult(null);
    startTransition(async () => {
      try {
        const r = await sendAllBriefsNowAction({ dateIso });
        setResult(r);
        if (r.ok) router.refresh();
      } catch (e) {
        setResult({
          ok: false,
          duration_ms: 0,
          per_role: [],
          error: e instanceof Error ? e.message : String(e),
        });
      }
    });
  };

  return (
    <section className="ix-card p-3 space-y-2 border-l-4 border-amber-400">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300 font-semibold">
          Audit re-send:
        </span>
        <button
          type="button"
          onClick={run}
          disabled={pending}
          className="ix-btn-primary !text-xs"
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          Send ALL 3 briefs NOW
        </button>
        <span className="text-[10px] text-slate-400 ml-auto">
          Date: {dateIso} · Wipes today's log + re-sends GR + Ops + Finance in parallel
        </span>
      </div>

      {pending && (
        <div className="border-l-4 border-cyan-500 bg-cyan-50/60 dark:bg-cyan-900/10 p-2 flex items-center gap-2 text-[11px] text-cyan-900 dark:text-cyan-200">
          <Loader2 size={12} className="animate-spin" />
          <span>Re-sending all 3 briefs to WhatsApp + email…</span>
        </div>
      )}

      {result && !pending && (
        <div className={`border-l-4 ${result.ok ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-900/10 text-emerald-900 dark:text-emerald-200' : 'border-rose-500 bg-rose-50/60 dark:bg-rose-900/10 text-rose-900 dark:text-rose-200'} p-2 space-y-1 text-[11px]`}>
          <div className="flex items-center gap-1.5 font-semibold">
            {result.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
            {result.ok ? `All briefs sent in ${result.duration_ms}ms` : `Failed in ${result.duration_ms}ms`}
          </div>
          {result.error && <div className="break-words">{result.error}</div>}
          {result.per_role.length > 0 && (
            <ul className="list-disc list-inside space-y-0.5 mt-1">
              {result.per_role.map(r => (
                <li key={r.role}>
                  <span className="font-medium">{ROLE_LABEL[r.role]}</span>:
                  {' '}{r.recipients} recipient{r.recipients === 1 ? '' : 's'}
                  {' '}· WhatsApp {r.delivered_whatsapp}
                  {r.delivered_email > 0 ? ` · Email ${r.delivered_email}` : ''}
                  {r.failed > 0 ? <span className="text-rose-700 dark:text-rose-300"> · {r.failed} failed</span> : ''}
                  {r.error ? ` · ${r.error}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
