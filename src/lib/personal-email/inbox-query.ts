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
  to_address: string | null;
  received_at: string | null;
  category: CategorySlug | null;
  category_method: string | null;
  needs_review: boolean;
  // Gmail label state — used by the UI to determine if the user has
  // already acted on a marked email (read removes UNREAD; archive
  // removes INBOX). Marked-and-unactioned rows pin to the top of the
  // drill-down list.
  label_ids: string[];
};

export type InboxFilters = {
  accountId?: string;          // single account, else all personal
  category?: CategorySlug;     // single category drill-down
  needsReviewOnly?: boolean;
  limit?: number;
  // By default the boxes mirror Gmail's inbox view — archived rows
  // (INBOX label removed) drop off so the Archive bulk-action visibly
  // works. Pass `true` for surfaces that want to show archived too
  // (e.g. an "All / Archived" toggle in a future iteration).
  includeArchived?: boolean;
};

export async function loadInbox(filters: InboxFilters = {}): Promise<InboxRow[]> {
  const sb = supabaseAdmin();
  let q = sb
    .from('email_logs')
    .select('id, account_id, subject, from_address, to_address, received_at, category, category_method, needs_review, label_ids, accounts!inner(email, display_name, domain)')
    .eq('accounts.domain', 'personal')
    .order('received_at', { ascending: false })
    .limit(filters.limit ?? 200);

  if (filters.accountId) q = q.eq('account_id', filters.accountId);
  if (filters.category) q = q.eq('category', filters.category);
  if (filters.needsReviewOnly) q = q.eq('needs_review', true);
  if (!filters.includeArchived) q = q.contains('label_ids', ['INBOX']);

  const { data, error } = await q;
  if (error) throw new Error(`inbox_load_failed: ${error.message}`);
  return ((data ?? []) as any[]).map(r => ({
    id: r.id,
    account_id: r.account_id,
    account_email: r.accounts?.email ?? '',
    account_display_name: r.accounts?.display_name ?? null,
    subject: r.subject,
    from_address: r.from_address,
    to_address: r.to_address ?? null,
    received_at: r.received_at,
    category: r.category as CategorySlug | null,
    category_method: r.category_method ?? null,
    needs_review: !!r.needs_review,
    label_ids: Array.isArray(r.label_ids) ? r.label_ids as string[] : [],
  }));
}

export type CategoryCount = { category: CategorySlug; count: number };

export async function loadCategoryCounts(accountId?: string): Promise<CategoryCount[]> {
  const sb = supabaseAdmin();
  // Aggregating select avoids a RPC dependency. Cheap because rows are
  // bounded by `domain='personal'` accounts (a handful) and we only
  // pull the `category` column. Counts mirror loadInbox's default
  // INBOX-only filter so the card counters match the rows shown when
  // you click in.
  const init: CategoryCount[] = CATEGORIES.map(c => ({ category: c.slug, count: 0 }));
  let q = sb
    .from('email_logs')
    .select('category, accounts!inner(domain)')
    .eq('accounts.domain', 'personal')
    .not('category', 'is', null)
    .contains('label_ids', ['INBOX']);
  if (accountId) q = q.eq('account_id', accountId);
  const { data, error } = await q;
  if (error) throw new Error(`category_counts_failed: ${error.message}`);
  for (const r of (data ?? []) as any[]) {
    const hit = init.find(i => i.category === r.category);
    if (hit) hit.count += 1;
  }
  return init;
}

// Shape of a single email opened in the drill-down preview pane.
// Lives in the query module so multiple surfaces (category drill-down,
// needs-review) can fetch it without cross-importing each other.
export type SelectedEmail = {
  id: string;
  subject: string | null;
  from_address: string | null;
  to_address: string | null;
  received_at: string | null;
  body_excerpt: string | null;
  category: CategorySlug | null;
  category_confidence: number | null;
  category_method: string | null;
  category_reason: string | null;
  needs_review: boolean;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  account_display_name: string | null;
  account_email: string | null;
};

export async function loadSelectedEmail(emailLogId: string): Promise<SelectedEmail | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('email_logs')
    .select(`
      id, gmail_message_id, gmail_thread_id, subject, from_address, to_address,
      received_at, body_excerpt, category, category_confidence, category_method,
      category_reason, needs_review,
      accounts(email, display_name)
    `)
    .eq('id', emailLogId)
    .maybeSingle();
  if (error || !data) return null;
  const acc = (data as any).accounts;
  return {
    id: data.id,
    subject: data.subject,
    from_address: data.from_address,
    to_address: data.to_address,
    received_at: data.received_at,
    body_excerpt: data.body_excerpt,
    category: data.category as CategorySlug | null,
    category_confidence: data.category_confidence as number | null,
    category_method: data.category_method,
    category_reason: data.category_reason,
    needs_review: !!data.needs_review,
    gmail_message_id: data.gmail_message_id,
    gmail_thread_id: data.gmail_thread_id,
    account_display_name: acc?.display_name ?? null,
    account_email: acc?.email ?? null,
  };
}
