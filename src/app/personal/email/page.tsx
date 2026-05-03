import { CATEGORIES, getCategoriesByTier } from '@/lib/personal-email/categories';
import { loadInbox, loadCategoryCounts } from '@/lib/personal-email/inbox-query';
import { AccountFilter } from './_components/account-filter';
import { TierSection } from './_components/tier-section';
import { CategoryCard } from './_components/category-card';
import { RefreshButton } from './_components/refresh-button';
import { CategorySlug } from '@/lib/personal-email/schema';
import Link from 'next/link';
import { fmtCairoDateTime } from '@/lib/fmt-date';

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

  const [counts, recent] = await Promise.all([
    loadCategoryCounts(accountId),
    loadInbox({ accountId, limit: 200 }),
  ]);

  const countsBySlug = Object.fromEntries(counts.map(c => [c.category, c.count]));
  const top3BySlug: Record<string, typeof recent> = {};
  for (const r of recent) {
    if (!r.category) continue;
    (top3BySlug[r.category] ??= []).push(r);
  }

  return (
    <main className="max-w-6xl mx-auto px-6 py-8 space-y-6 flex-1">
      <header className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            Personal · Email
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Triage</h1>
        </div>
        <div className="flex items-center gap-3">
          <AccountFilter selected={accountId} />
          <RefreshButton />
          <Link href="/personal/email/setup" className="ix-link text-sm">Setup</Link>
        </div>
      </header>

      <div className="space-y-6">
        {[1, 2, 3, 4].map(t => {
          const cats = getCategoriesByTier(t as 1 | 2 | 3 | 4);
          if (!cats.length) return null;
          return (
            <TierSection key={t} tier={t as 1 | 2 | 3 | 4}>
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
    </main>
  );
}

async function CategoryFlatView({
  accountId, category,
}: { accountId?: string; category: CategorySlug }) {
  const rows = await loadInbox({ accountId, category, limit: 500 });
  const cat = CATEGORIES.find(c => c.slug === category);
  return (
    <main className="max-w-5xl mx-auto px-6 py-8 space-y-4 flex-1">
      <header className="flex items-center justify-between">
        <div>
          <Link href="/personal/email" className="ix-link text-sm">← All categories</Link>
          <h1 className="text-2xl font-bold">{cat?.displayName} · {rows.length}</h1>
        </div>
        <AccountFilter selected={accountId} />
      </header>
      <div className="ix-card divide-y divide-slate-100">
        {rows.map(r => (
          <Link
            key={r.id}
            href={`/personal/email/${r.id}`}
            className="block px-4 py-2.5 hover:bg-slate-50"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm truncate">
                  <span className="font-medium">{r.from_address?.split('<')[0].trim()}</span>
                  {' · '}
                  {r.subject}
                </div>
                <div className="text-[11px] text-slate-500">
                  {r.account_display_name} · {r.received_at && fmtCairoDateTime(r.received_at)}
                </div>
              </div>
              {r.needs_review && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">?</span>
              )}
            </div>
          </Link>
        ))}
        {!rows.length && <div className="p-8 text-center text-sm text-slate-500">No emails in this category yet.</div>}
      </div>
    </main>
  );
}
