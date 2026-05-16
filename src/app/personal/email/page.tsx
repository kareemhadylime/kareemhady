import Link from 'next/link';
import { Mail, Settings as SettingsIcon, AlertTriangle } from 'lucide-react';
import { CATEGORIES, getCategoriesByTier } from '@/lib/personal-email/categories';
import { loadInbox, loadCategoryCounts, loadSelectedEmail, loadCategoryTotal } from '@/lib/personal-email/inbox-query';
import type { CategorySlug } from '@/lib/personal-email/types';
import { supabaseAdmin } from '@/lib/supabase';
import { PersonalShell, PersonalHeader } from '../_components/personal-shell';
import { AccountFilter } from './_components/account-filter';
import { MailboxStatusBar } from './_components/mailbox-status-bar';
import { TierSection } from './_components/tier-section';
import { CategoryCard } from './_components/category-card';
import { RefreshButton } from './_components/refresh-button';
import { DrillDownView } from './_components/drill-down-view';

export const dynamic = 'force-dynamic';

export default async function PersonalEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; category?: string; msg?: string }>;
}) {
  const sp = await searchParams;
  const accountId = sp.account;
  const categoryFilter = sp.category as CategorySlug | undefined;
  const selectedMsgId = sp.msg;

  // If a category filter is set, show master-detail drill-down.
  if (categoryFilter) {
    return (
      <CategoryFlatView
        accountId={accountId}
        category={categoryFilter}
        selectedMsgId={selectedMsgId}
      />
    );
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

      {/* Mailbox status bar — shows each mailbox with sync status, also acts as filter */}
      {accountCount > 0 && <MailboxStatusBar selected={accountId} />}

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
  accountId, category, selectedMsgId,
}: {
  accountId?: string;
  category: CategorySlug;
  selectedMsgId?: string;
}) {
  const [rows, selected, totalCount] = await Promise.all([
    loadInbox({ accountId, category, limit: 500 }),
    selectedMsgId ? loadSelectedEmail(selectedMsgId) : Promise.resolve(null),
    loadCategoryTotal({ accountId, category }),
  ]);
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
        right={
          <>
            <Link href="/personal/email" className="ix-link text-xs">← All categories</Link>
            <AccountFilter selected={accountId} basePath={`/personal/email?category=${category}`} />
          </>
        }
      />

      <DrillDownView
        rows={rows}
        selected={selected}
        category={category}
        totalCount={totalCount}
        accountId={accountId}
      />
    </PersonalShell>
  );
}

