import Link from 'next/link';
import { Plus, Play, Pencil, Trash2, ChevronRight } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { TopNav } from '@/app/_components/brand';
import { SetupTabs } from '@/app/admin/_components/setup-tabs';
import { deleteRule, runRuleAction } from './actions';
import { DOMAIN_LABELS, type Domain } from '@/lib/rules/presets';

export const dynamic = 'force-dynamic';

export default async function RulesListPage() {
  const sb = supabaseAdmin();
  const { data: rules } = await sb
    .from('rules')
    .select('*, account:accounts(email)')
    .order('priority', { ascending: true });

  return (
    <>
      <TopNav>
        <Link href="/" className="ix-link">Home</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <Link href="/admin" className="ix-link">Setup</Link>
        <ChevronRight size={14} className="text-slate-400" />
        <span>Email Rules</span>
      </TopNav>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8 flex-1">
        <header className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
              Setup · Email Rules
            </p>
            <h1 className="text-3xl font-bold tracking-tight">Rules</h1>
            <p className="text-sm text-slate-500 mt-1">
              Filter emails and produce structured outputs.
            </p>
          </div>
          <Link href="/admin/rules/new" className="ix-btn-primary">
            <Plus size={16} /> New rule
          </Link>
        </header>

        <SetupTabs activeTab="rules" />

        <section>
          {!rules?.length ? (
            <div className="ix-card p-8 text-center">
              <p className="text-slate-500 text-sm mb-4">
                No rules yet. Create one to start aggregating emails.
              </p>
              <Link href="/admin/rules/new" className="ix-btn-primary">
                <Plus size={16} /> Create your first rule
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((r: any) => (
                <div
                  key={r.id}
                  className="ix-card p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link href={`/admin/rules/${r.id}`} className="font-semibold hover:underline">
                        {r.name}
                      </Link>
                      {r.domain && <DomainBadge d={r.domain as Domain} />}
                      {!r.enabled && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          disabled
                        </span>
                      )}
                      {r.actions?.mark_as_read && (
                        <span className="text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">
                          mark read
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-x-3 gap-y-1">
                      <span>Account: {r.account?.email || 'all'}</span>
                      {r.conditions?.from_contains && <span>from~{r.conditions.from_contains}</span>}
                      {r.conditions?.subject_contains && <span>subject~{r.conditions.subject_contains}</span>}
                      <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">
                        {r.actions?.type}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <form action={runRuleAction}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="ix-btn-primary">
                        <Play size={14} /> Run
                      </button>
                    </form>
                    <Link href={`/admin/rules/${r.id}`} className="ix-btn-secondary">
                      <Pencil size={14} /> Edit
                    </Link>
                    <form action={deleteRule}>
                      <input type="hidden" name="id" value={r.id} />
                      <button type="submit" className="ix-btn-danger">
                        <Trash2 size={14} /> Delete
                      </button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </>
  );
}

function DomainBadge({ d }: { d: Domain }) {
  const palette: Record<Domain, string> = {
    personal: 'bg-slate-100 text-slate-700',
    kika: 'bg-violet-100 text-violet-700',
    lime: 'bg-emerald-100 text-emerald-700',
    fmplus: 'bg-amber-100 text-amber-700',
    voltauto: 'bg-indigo-100 text-indigo-700',
    beithady: 'bg-rose-100 text-rose-700',
  };
  return (
    <span className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded ${palette[d]}`}>
      {DOMAIN_LABELS[d]}
    </span>
  );
}
