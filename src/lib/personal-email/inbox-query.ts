import { supabaseAdmin } from '@/lib/supabase';
import type { CategorySlug } from './types';
import { CATEGORIES } from './categories';

export type InboxRow = {
  id: string;
  account_id: string;
  account_email: string;
  account_display_name: string | null;
  subject: string | null;
  from_address: string | null;
  received_at: string | null;
  category: CategorySlug | null;
  needs_review: boolean;
};

export type InboxFilters = {
  accountId?: string;          // single account, else all personal
  category?: CategorySlug;     // single category drill-down
  needsReviewOnly?: boolean;
  limit?: number;
};

export async function loadInbox(filters: InboxFilters = {}): Promise<InboxRow[]> {
  const sb = supabaseAdmin();
  let q = sb
    .from('email_logs')
    .select('id, account_id, subject, from_address, received_at, category, needs_review, accounts!inner(email, display_name, domain)')
    .eq('accounts.domain', 'personal')
    .order('received_at', { ascending: false })
    .limit(filters.limit ?? 200);

  if (filters.accountId) q = q.eq('account_id', filters.accountId);
  if (filters.category) q = q.eq('category', filters.category);
  if (filters.needsReviewOnly) q = q.eq('needs_review', true);

  const { data, error } = await q;
  if (error) throw new Error(`inbox_load_failed: ${error.message}`);
  return ((data ?? []) as any[]).map(r => ({
    id: r.id,
    account_id: r.account_id,
    account_email: r.accounts?.email ?? '',
    account_display_name: r.accounts?.display_name ?? null,
    subject: r.subject,
    from_address: r.from_address,
    received_at: r.received_at,
    category: r.category as CategorySlug | null,
    needs_review: !!r.needs_review,
  }));
}

export type CategoryCount = { category: CategorySlug; count: number };

export async function loadCategoryCounts(accountId?: string): Promise<CategoryCount[]> {
  const sb = supabaseAdmin();
  // Aggregating select avoids a RPC dependency. Cheap because rows are
  // bounded by `domain='personal'` accounts (a handful) and we only
  // pull the `category` column.
  const init: CategoryCount[] = CATEGORIES.map(c => ({ category: c.slug, count: 0 }));
  let q = sb
    .from('email_logs')
    .select('category, accounts!inner(domain)')
    .eq('accounts.domain', 'personal')
    .not('category', 'is', null);
  if (accountId) q = q.eq('account_id', accountId);
  const { data, error } = await q;
  if (error) throw new Error(`category_counts_failed: ${error.message}`);
  for (const r of (data ?? []) as any[]) {
    const hit = init.find(i => i.category === r.category);
    if (hit) hit.count += 1;
  }
  return init;
}
