import { supabaseAdmin } from '@/lib/supabase';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import { SetupTabs } from '../_components/setup-tabs';
import {
  tagDomainPersonal,
  disconnectAccountAndRemoveLabels,
  archiveOldAndResetSync,
} from './actions';
import { Plus, Mail, Archive } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function AccountsSetupPage() {
  const sb = supabaseAdmin();
  const [{ data: personalAccts }, { data: untagged }] = await Promise.all([
    sb.from('accounts').select('*').eq('domain', 'personal').order('email'),
    sb.from('accounts').select('*').is('domain', null).eq('enabled', true).order('email'),
  ]);

  return (
    <main className="max-w-4xl mx-auto px-6 py-8 space-y-6 flex-1">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Setup</h1>
        <a href="/api/auth/google/start?domain=personal" className="ix-btn-primary">
          <Plus size={16} /> Connect Gmail
        </a>
      </header>
      <SetupTabs activeTab="accounts" />

      <section className="space-y-2">
        <h2 className="text-sm uppercase tracking-wide font-semibold text-slate-500">
          Personal mailboxes ({personalAccts?.length ?? 0})
        </h2>
        {(personalAccts ?? []).map((a: any) => (
          <div key={a.id} className="ix-card p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-slate-50 text-slate-700 inline-flex items-center justify-center">
              <Mail size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-mono text-sm truncate flex items-center gap-2">
                {a.email}
                {a.display_name && (
                  <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-slate-100">
                    {a.display_name}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500">
                Last sync: {a.last_synced_at ? fmtCairoDateTime(a.last_synced_at) : 'never'}
              </div>
            </div>
            <form action={disconnectAccountAndRemoveLabels.bind(null, a.id)}>
              <button type="submit" className="ix-btn-danger">Disconnect + remove Lime/* labels</button>
            </form>
          </div>
        ))}
        {!personalAccts?.length && (
          <p className="text-sm text-slate-500">No personal mailboxes yet. Click <strong>Connect Gmail</strong> to add one.</p>
        )}
      </section>

      {!!untagged?.length && (
        <section className="space-y-2">
          <h2 className="text-sm uppercase tracking-wide font-semibold text-slate-500">
            Other connected mailboxes (not yet personal)
          </h2>
          {untagged.map((a: any) => (
            <div key={a.id} className="ix-card p-4 flex items-center gap-4">
              <div className="flex-1 font-mono text-sm">{a.email}</div>
              <form action={tagDomainPersonal.bind(null, a.id)}>
                <button type="submit" className="ix-btn-secondary">Tag as personal + create labels</button>
              </form>
            </div>
          ))}
        </section>
      )}

      {/* One-shot backfill: archive everything before a cutoff date and
          reset last_synced_at so the next ingest pulls from there. */}
      {!!personalAccts?.length && (
        <section className="ix-card p-4 space-y-3 border-amber-200 dark:border-amber-900">
          <div className="flex items-center gap-2">
            <Archive size={16} className="text-amber-700 dark:text-amber-300" />
            <h2 className="text-sm uppercase tracking-wide font-semibold text-amber-800 dark:text-amber-200">
              Backfill — archive old + ingest from cutoff
            </h2>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            For every personal mailbox: mark-read + remove the INBOX label
            (= archive in Gmail) on every message dated <strong>before</strong>
            the cutoff, then reset <code>last_synced_at</code> to that cutoff
            so the next ingest fetches everything from the cutoff forward.
            Useful for resetting an inbox before a clean catch-up. Press
            once and wait — the action loops through every account and
            triggers an ingest at the end.
          </p>
          <form action={archiveOldAndResetSync} className="flex items-end gap-2 flex-wrap">
            <label className="block">
              <span className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                Cutoff (YYYY-MM-DD)
              </span>
              <input
                type="date"
                name="cutoff"
                defaultValue="2026-04-15"
                required
                className="ix-input"
              />
            </label>
            <button type="submit" className="ix-btn-primary">
              <Archive size={14} /> Archive + reset
            </button>
          </form>
        </section>
      )}
    </main>
  );
}
