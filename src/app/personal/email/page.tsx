import Link from 'next/link';
import { Mail, Settings as SettingsIcon, AlertTriangle } from 'lucide-react';
import { CATEGORIES, getCategoriesByTier } from '@/lib/personal-email/categories';
import { loadInbox, loadCategoryCounts } from '@/lib/personal-email/inbox-query';
import { fmtCairoDateTime } from '@/lib/fmt-date';
import type { CategorySlug } from '@/lib/personal-email/types';
import { supabaseAdmin } from '@/lib/supabase';
import { PersonalShell, PersonalHeader } from '../_components/personal-shell';
import { AccountFilter } from './_components/account-filter';
import { TierSection } from './_components/tier-section';
import { CategoryCard } from './_components/category-card';
import { RefreshButton } from './_components/refresh-button';

export const dynamic = 'force-dynamic';

export default async function PersonalEmailPage({
  searchParams,
}: { searchParams: Promise<{ account?: string; category?: string }> }) {
  const sp = await searchParams;
  const accountId = sp.account;
  const categoryFilter = sp.category as CategorySlug | undefined;

  // If a category filter is set, show flat list instead of tier-grouped overview.
  if (categoryFilter) {
    return <CategoryFlatView accountId={accountId} category={categoryFilter} />;
  }

  const [counts, recent, needsReviewCount, accountCount] = await Promise.all([
    loadCategoryCounts(accountId),
    loadInbox({ accountId, limit: 200 }),
    loadNeedsReviewCount(accountId),
    loadConnectedAccountCount(),
  ]);

  const countsBySlug = Object.fromEntries(counts.map(c => [c.category, c.count]));
  const top3BySlug: Record<string, typeof recent> = {};
  for (const r of recent) {
    if (!r.category) continue;
    (top3BySlug[r.category] ??= []).push(r);
  }

  const totalEmails = Object.values(countsBySlug).reduce((s, n) => s + n, 0);

  return (
    <PersonalShell breadcrumbs={[{ label: 'Email' }]}>
      <PersonalHeader
        eyebrow="Personal · Inbox triage"
        title="Email"
        subtitle="Three Gmail mailboxes (GMAIL · LIME · FM+) classified into nine categories by a rule + Claude Haiku 4.5 hybrid pipeline. Two-way Gmail label sync keeps your phone inbox in step."
        icon={Mail}
        right={(
          <>
            {needsReviewCount > 0 && (
              <Link
                href={`/personal/email/needs-review${accountId ? `?account=${accountId}` : ''}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 hover:bg-amber-100 transition"
              >
                <AlertTriangle size={14} />
                {needsReviewCount} need{needsReviewCount === 1 ? 's' : ''} review
              </Link>
            )}
            <RefreshButton />
            <Link
              href="/personal/email/setup"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition"
            >
              <SettingsIcon size={14} />
              Setup
            </Link>
          </>
        )}
      />

      {/* Stat strip */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Connected mailboxes" value={accountCount.toString()} accent="slate" />
        <Stat label="Classified emails" value={totalEmails.toLocaleString()} accent="emerald" />
        <Stat label="Need action now" value={(countsBySlug.action_required ?? 0).toLocaleString()} accent="rose" />
        <Stat label="Delete-bait" value={((countsBySlug.promotions ?? 0) + (countsBySlug.spam ?? 0)).toLocaleString()} accent="zinc" />
      </section>

      {/* Account filter row */}
      {accountCount > 0 && (
        <section className="flex items-center gap-3 flex-wrap">
          <span className="text-[11px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400">
            Mailbox
          </span>
          <AccountFilter selected={accountId} />
        </section>
      )}

      {/* Empty state */}
      {accountCount === 0 ? (
        <EmptyConnectAccount />
      ) : totalEmails === 0 ? (
        <EmptyAwaitingIngest />
      ) : (
        <div className="space-y-8">
          {[1, 2, 3, 4].map(t => {
            const tier = t as 1 | 2 | 3 | 4;
            const cats = getCategoriesByTier(tier);
            if (!cats.length) return null;
            const tierCount = cats.reduce((s, c) => s + (countsBySlug[c.slug] ?? 0), 0);
            return (
              <TierSection key={t} tier={tier} count={tierCount}>
                {cats.map(c => (
                  <CategoryCard
                    key={c.slug}
                    cat={c}
                    count={countsBySlug[c.slug] ?? 0}
                    top3={top3BySlug[c.slug] ?? []}
                    basePath="/personal/email"
                  />
                ))}
              </TierSection>
            );
          })}
        </div>
      )}

      <footer className="text-[11px] text-slate-400 dark:text-slate-500 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Personal · Email — rule-first classification with Claude Haiku 4.5 fallback. Daily AI cap configurable in Setup → AI.
      </footer>
    </PersonalShell>
  );
}

const STAT_ACCENTS: Record<string, string> = {
  slate: 'text-slate-700 dark:text-slate-200',
  emerald: 'text-emerald-700 dark:text-emerald-300',
  rose: 'text-rose-700 dark:text-rose-300',
  zinc: 'text-zinc-700 dark:text-zinc-300',
};

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="ix-card p-4 flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 dark:text-slate-400">
        {label}
      </span>
      <span className={`text-2xl font-bold tabular-nums ${STAT_ACCENTS[accent] ?? STAT_ACCENTS.slate}`}>
        {value}
      </span>
    </div>
  );
}

function EmptyConnectAccount() {
  return (
    <div className="ix-card p-10 text-center max-w-xl mx-auto">
      <Mail size={28} className="mx-auto text-slate-400" />
      <h2 className="mt-3 text-lg font-semibold">No personal mailboxes connected yet</h2>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">
        Connect GMAIL, LIME, and FM+ to start the 15-minute classification cron.
        We&apos;ll create nine <code>Lime/*</code> labels in each Gmail account on first connect.
      </p>
      <Link href="/personal/email/setup/accounts" className="ix-btn-primary inline-flex">
        Go to Setup → Accounts
      </Link>
    </div>
  );
}

function EmptyAwaitingIngest() {
  return (
    <div className="ix-card p-8 text-center">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Mailbox connected — no emails classified yet. Click <strong>Refresh</strong> to ingest the last 24h.
      </p>
    </div>
  );
}

async function loadNeedsReviewCount(accountId?: string): Promise<number> {
  const sb = supabaseAdmin();
  let q = sb
    .from('email_logs')
    .select('id, accounts!inner(domain)', { count: 'exact', head: true })
    .eq('accounts.domain', 'personal')
    .eq('needs_review', true);
  if (accountId) q = q.eq('account_id', accountId);
  const { count } = await q;
  return count ?? 0;
}

async function loadConnectedAccountCount(): Promise<number> {
  const sb = supabaseAdmin();
  const { count } = await sb
    .from('accounts')
    .select('id', { count: 'exact', head: true })
    .eq('domain', 'personal')
    .eq('enabled', true);
  return count ?? 0;
}

async function CategoryFlatView({
  accountId, category,
}: { accountId?: string; category: CategorySlug }) {
  const rows = await loadInbox({ accountId, category, limit: 500 });
  const cat = CATEGORIES.find(c => c.slug === category);
  return (
    <PersonalShell breadcrumbs={[
      { label: 'Email', href: '/personal/email' },
      { label: cat?.displayName ?? category },
    ]}>
      <PersonalHeader
        eyebrow={`Personal · Email · ${cat?.displayName ?? category}`}
        title={cat?.displayName ?? category}
        subtitle={cat?.description}
        right={<AccountFilter selected={accountId} basePath={`/personal/email?category=${category}`} />}
      />

      <div className="ix-card overflow-hidden">
        <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
            {rows.length} email{rows.length === 1 ? '' : 's'}
          </span>
          <Link href="/personal/email" className="ix-link text-xs">← All categories</Link>
        </div>
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map(r => (
            <li key={r.id}>
              <Link href={`/personal/email/${r.id}`} className="block px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-900/40 transition">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm truncate">
                      <span className="font-semibold text-slate-900 dark:text-slate-50">
                        {r.from_address?.split('<')[0].trim() || '—'}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400"> · {r.subject || '(no subject)'}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      {r.account_display_name} {r.received_at && `· ${fmtCairoDateTime(r.received_at)}`}
                    </div>
                  </div>
                  {r.needs_review && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-200">
                      review
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
          {!rows.length && (
            <li className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No emails in this category yet.
            </li>
          )}
        </ul>
      </div>
    </PersonalShell>
  );
}
