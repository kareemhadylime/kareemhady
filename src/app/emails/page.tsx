import Link from 'next/link';
import { ArrowUpRight, Layers } from 'lucide-react';
import { TopNav } from '../_components/brand';
import { DomainIcon } from '../_components/domain-icon';
import { SyncPills } from '../_components/sync-pills';
import { supabaseAdmin } from '@/lib/supabase';
import { fmtCairoDate } from '@/lib/fmt-date';
import { getSyncFreshness } from '@/lib/sync-freshness';
import {
  DOMAINS,
  DOMAIN_LABELS,
  DOMAIN_DESCRIPTIONS,
  DOMAIN_ACCENTS,
  type Domain,
  type DomainAccent,
} from '@/lib/rules/presets';

export const dynamic = 'force-dynamic';

type DomainCardData = {
  id: Domain | 'other';
  label: string;
  description: string;
  accent: DomainAccent;
  rule_count: number;
  last_run_at: string | null;
};

const ACCENT_CLASSES: Record<DomainAccent, { grad: string; text: string; bg: string }> = {
  slate: { grad: 'from-slate-500 to-slate-700', text: 'text-slate-600', bg: 'bg-slate-50' },
  violet: { grad: 'from-violet-500 to-violet-700', text: 'text-violet-600', bg: 'bg-violet-50' },
  emerald: { grad: 'from-emerald-500 to-emerald-700', text: 'text-emerald-600', bg: 'bg-emerald-50' },
  amber: { grad: 'from-amber-500 to-amber-700', text: 'text-amber-600', bg: 'bg-amber-50' },
  indigo: { grad: 'from-indigo-500 to-indigo-700', text: 'text-indigo-600', bg: 'bg-indigo-50' },
  rose: { grad: 'from-rose-500 to-rose-700', text: 'text-rose-600', bg: 'bg-rose-50' },
  cyan: { grad: 'from-cyan-500 to-cyan-700', text: 'text-cyan-600', bg: 'bg-cyan-50' },
};

export default async function EmailsHome() {
  const sb = supabaseAdmin();

  const pills = await getSyncFreshness(['gmail']);

  const { data: rules } = await sb.from('rules').select('id, domain');

  const ruleIdsByDomain = new Map<string, string[]>();
  for (const r of rules || []) {
    const key = (r as any).domain && (DOMAINS as readonly string[]).includes((r as any).domain)
      ? (r as any).domain
      : 'other';
    const arr = ruleIdsByDomain.get(key) || [];
    arr.push((r as any).id);
    ruleIdsByDomain.set(key, arr);
  }

  const allRuleIds = (rules || []).map((r: any) => r.id);
  const lastRunByRule = new Map<string, string>();
  if (allRuleIds.length) {
    const { data: latestRuns } = await sb
      .from('rule_runs')
      .select('rule_id, finished_at')
      .in('rule_id', allRuleIds)
      .order('finished_at', { ascending: false })
      .limit(500);
    for (const rr of latestRuns || []) {
      const k = (rr as any).rule_id;
      if (!lastRunByRule.has(k) && (rr as any).finished_at) {
        lastRunByRule.set(k, (rr as any).finished_at);
      }
    }
  }

  function lastRunForDomain(d: Domain | 'other'): string | null {
    const ids = ruleIdsByDomain.get(d) || [];
    let max: string | null = null;
    for (const id of ids) {
      const t = lastRunByRule.get(id);
      if (t && (!max || t > max)) max = t;
    }
    return max;
  }

  const cards: DomainCardData[] = DOMAINS.map(d => ({
    id: d,
    label: DOMAIN_LABELS[d],
    description: DOMAIN_DESCRIPTIONS[d],
    accent: DOMAIN_ACCENTS[d],
    rule_count: (ruleIdsByDomain.get(d) || []).length,
    last_run_at: lastRunForDomain(d),
  }));

  const otherIds = ruleIdsByDomain.get('other') || [];
  if (otherIds.length > 0) {
    cards.push({
      id: 'other',
      label: 'Other',
      description: 'Rules without a domain assigned.',
      accent: 'slate',
      rule_count: otherIds.length,
      last_run_at: lastRunForDomain('other'),
    });
  }

  return (
    <>
      <TopNav>
        <Link href="/" className="ix-link">Home</Link>
      </TopNav>
      <main className="max-w-6xl mx-auto px-6 py-10 space-y-8 flex-1">
        <header className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
              Emails · Reports &amp; outputs
            </p>
            <h1 className="text-3xl font-bold tracking-tight">Pick a domain</h1>
            <p className="text-sm text-slate-500 mt-1">
              Each domain holds its own set of rule dashboards.
            </p>
          </div>
          <SyncPills pills={pills} />
        </header>

        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {cards.map(c => (
            <DomainCard key={c.id} c={c} />
          ))}
        </section>
      </main>
    </>
  );
}

function DomainCard({ c }: { c: DomainCardData }) {
  const a = ACCENT_CLASSES[c.accent];
  return (
    <Link
      href={`/emails/${c.id}`}
      className="group relative block ix-card overflow-hidden p-6 hover:shadow-md hover:-translate-y-0.5 transition"
    >
      <div className={`absolute -top-8 -right-8 w-40 h-40 rounded-full bg-gradient-to-br ${a.grad} opacity-10 blur-2xl pointer-events-none`} />
      <div className="absolute bottom-0 right-0 opacity-[0.06] pointer-events-none">
        {c.id === 'other' ? (
          <Layers size={140} strokeWidth={1.2} />
        ) : (
          <DomainIcon domain={c.id} size={140} />
        )}
      </div>

      <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl ${a.bg}`}>
        {c.id === 'other' ? (
          <Layers className={a.text} size={24} strokeWidth={2.2} />
        ) : (
          <DomainIcon domain={c.id} size={24} className={a.text} />
        )}
      </div>

      <div className="mt-4 flex items-start justify-between gap-3">
        <h2 className="text-xl font-semibold tracking-tight">{c.label}</h2>
        <ArrowUpRight
          size={18}
          className="text-slate-400 group-hover:text-indigo-600 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 transition"
        />
      </div>
      <p className="mt-1 text-sm text-slate-500 max-w-md">{c.description}</p>

      <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
        <span>
          <span className="font-semibold text-slate-900">{c.rule_count}</span>{' '}
          rule{c.rule_count !== 1 ? 's' : ''}
        </span>
        <span>
          {c.last_run_at
            ? `Last run · ${fmtCairoDate(c.last_run_at)}`
            : 'No runs yet'}
        </span>
      </div>
    </Link>
  );
}
