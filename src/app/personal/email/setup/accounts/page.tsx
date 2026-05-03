import { supabaseAdmin } from '@/lib/supabase';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import { SetupTabs } from '../_components/setup-tabs';
import { tagDomainPersonal, disconnectAccountAndRemoveLabels } from './actions';
import { Plus, Mail } from 'lucide-react';

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
    </main>
  );
}
