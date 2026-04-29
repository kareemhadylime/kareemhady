import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { SlaBucket } from './sla';

// Server-side queries powering the Communication tabs. Reads from
// beithady_conversations + beithady_messages exclusively — those are
// the canonical channel-agnostic mirrors.

export type Channel = 'guesty' | 'wa_cloud' | 'wa_casual';

export type InboxSort =
  | 'sla_oldest'      // breach + age desc — oldest unanswered first (default)
  | 'sla_newest'      // age asc — newest unanswered first
  | 'recent_inbound'  // last_inbound_at desc — most recent guest message first
  | 'recent_activity' // modified_at_external desc — last touched anywhere
  | 'recent_outbound' // last_outbound_at desc — most recently replied first
  | 'name_asc';       // guest_full_name asc

export type InboxFilter = {
  channel?: Channel;
  search?: string;          // matches guest_full_name | guest_email | guest_phone | listing_nickname
  building?: string;
  source?: string;          // airbnb | booking.com | direct | ...
  slaBucket?: SlaBucket;    // 'red' to surface breaches
  unreadOnly?: boolean;
  breachOnly?: boolean;     // sla_breach=true (any bucket past the breach threshold)
  state?: 'open' | 'closed' | 'all';
  sort?: InboxSort;
  // Phase R — archive scoping. By default the active inbox excludes
  // archived rows. The archive tab / year-month detail flips this.
  archiveScope?:
    | 'active'              // archived_at IS NULL (default — active inbox)
    | 'archived_only'       // archived_at IS NOT NULL (archive view)
    | 'archived_in_month'   // archived view scoped to one calendar month
    | 'all';                // ignore archive entirely
  archiveYear?: number;     // used with archived_in_month
  archiveMonth?: number;    // 1-12, used with archived_in_month
};

export type InboxRow = {
  id: string;
  channel: Channel;
  external_id: string;
  guest_id: string | null;
  guest_full_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  listing_nickname: string | null;
  building_code: string | null;
  source: string | null;
  state: 'open' | 'closed';
  unread_count: number;
  tags: string[];
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  sla_age_seconds: number | null;
  sla_bucket: SlaBucket;
  sla_breach: boolean;
  modified_at_external: string | null;
  // Phase R archive bookkeeping — populated when archived
  archived_at: string | null;
  archived_reason: string | null;
};

export type InboxResult = {
  rows: InboxRow[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listInbox(opts: {
  filter?: InboxFilter;
  page?: number;
  pageSize?: number;
} = {}): Promise<InboxResult> {
  const sb = supabaseAdmin();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(10, Math.min(200, opts.pageSize ?? 50));
  const f = opts.filter ?? {};

  let q = sb
    .from('beithady_conversations')
    .select(
      'id, channel, external_id, guest_id, guest_full_name, guest_email, guest_phone, listing_nickname, building_code, source, state, unread_count, tags, last_inbound_at, last_outbound_at, sla_age_seconds, sla_bucket, sla_breach, modified_at_external, archived_at, archived_reason',
      { count: 'exact' }
    );

  // Phase R — archive scoping. Default = 'active' = archived_at is null.
  const scope = f.archiveScope || 'active';
  if (scope === 'active') {
    q = q.is('archived_at', null);
  } else if (scope === 'archived_only') {
    q = q.not('archived_at', 'is', null);
  } else if (scope === 'archived_in_month' && f.archiveYear && f.archiveMonth) {
    // Bucket key is coalesce(modified_at_external, last_inbound_at, created_at)
    // — the same expression we use in the year/month grids. We do the
    // bucket comparison in JS via the start/end ISO bounds for the month.
    const start = new Date(Date.UTC(f.archiveYear, f.archiveMonth - 1, 1)).toISOString();
    const end = new Date(Date.UTC(f.archiveYear, f.archiveMonth, 1)).toISOString();
    q = q
      .not('archived_at', 'is', null)
      .gte('modified_at_external', start)
      .lt('modified_at_external', end);
  }
  // 'all' — no filter applied.

  if (f.channel) q = q.eq('channel', f.channel);
  if (f.search && f.search.trim()) {
    const s = f.search.trim();
    q = q.or(
      `guest_full_name.ilike.%${s}%,guest_email.ilike.%${s}%,guest_phone.ilike.%${s.replace(/[^0-9+]/g, '')}%,listing_nickname.ilike.%${s}%`
    );
  }
  if (f.building) q = q.eq('building_code', f.building);
  if (f.source) q = q.eq('source', f.source);
  if (f.slaBucket) {
    if (f.slaBucket === 'none') q = q.is('sla_bucket', null);
    else q = q.eq('sla_bucket', f.slaBucket);
  }
  if (f.unreadOnly) q = q.gt('unread_count', 0);
  if (f.breachOnly) q = q.eq('sla_breach', true);
  if (f.state && f.state !== 'all') q = q.eq('state', f.state);
  else if (!f.state) q = q.eq('state', 'open');

  const sort: InboxSort = f.sort || 'sla_oldest';
  switch (sort) {
    case 'sla_newest':
      q = q.order('sla_age_seconds', { ascending: true, nullsFirst: false });
      break;
    case 'recent_inbound':
      q = q.order('last_inbound_at', { ascending: false, nullsFirst: false });
      break;
    case 'recent_activity':
      q = q.order('modified_at_external', { ascending: false, nullsFirst: false });
      break;
    case 'recent_outbound':
      q = q.order('last_outbound_at', { ascending: false, nullsFirst: false });
      break;
    case 'name_asc':
      q = q.order('guest_full_name', { ascending: true, nullsFirst: false });
      break;
    case 'sla_oldest':
    default:
      // Original behaviour: breach + oldest unreplied first
      q = q
        .order('sla_breach', { ascending: false })
        .order('sla_age_seconds', { ascending: false, nullsFirst: false })
        .order('modified_at_external', { ascending: false, nullsFirst: false });
  }
  q = q.range((page - 1) * pageSize, page * pageSize - 1);

  const { data, count } = await q;
  return {
    rows: ((data as InboxRow[] | null) || []),
    total: count ?? 0,
    page,
    pageSize,
  };
}

export type ThreadMessage = {
  id: string;
  channel: Channel;
  external_id: string | null;
  direction: 'inbound' | 'outbound';
  module_type: string | null;
  module_subject: string | null;
  body: string | null;
  is_automatic: boolean;
  from_full_name: string | null;
  from_type: string | null;
  template_name: string | null;
  attachments: unknown;
  ai_classification: string | null;
  ai_used_for_auto_send: boolean;
  sent_at: string | null;
  created_at: string;
};

export type ThreadHeader = InboxRow & {
  ai_kill_switch: boolean;
  reservation_id: string | null;
  archived_by_user_id: string | null;
  listing_id: string | null;
  // Phase Q.4 — resolved bookkeeping
  resolved_at: string | null;
  resolved_reason: string | null;
  resolved_by_user_id: string | null;
};

// Q.1 — reservation summary attached to the thread bundle. Computed via
// the conv.reservation_id → guesty_reservations join. Null when the
// conversation has no linked reservation (cold lead) or when the join
// misses (orphan, very rare per Q.0 — 0 cases observed).
export type ThreadReservation = {
  id: string;
  status: string | null;
  source: string | null;
  confirmation_code: string | null;
  platform_confirmation_code: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  nights: number | null;
  guests: number | null;
  currency: string | null;
  guest_paid: number | null;
  host_payout: number | null;
};

// Q.1 — guest history snapshot for the inline badge. All sourced from
// beithady_guests directly per Q.0.5.
export type ThreadGuestStats = {
  lifetime_stays: number;
  lifetime_nights: number;
  lifetime_spend_usd: number | null;
  vip: boolean;
  loyalty_tier: string | null;
  last_seen: string | null;
  language: string | null;
};

// Q.4 — internal staff note attached to a conversation. Author display
// name is joined from app_users.
export type ThreadNote = {
  id: string;
  author_user_id: string;
  author_username: string | null;
  body: string;
  created_at: string;
};

export type ThreadBundle = {
  header: ThreadHeader;
  messages: ThreadMessage[];
  reservation: ThreadReservation | null;
  guestStats: ThreadGuestStats | null;
  notes: ThreadNote[];
};

export async function loadThread(conversationId: string): Promise<ThreadBundle | null> {
  const sb = supabaseAdmin();
  const { data: conv } = await sb
    .from('beithady_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();
  if (!conv) return null;

  const header = conv as ThreadHeader;

  // Parallel fetch: messages + reservation join + guest history + notes.
  // None depend on each other so they run together to keep the right-panel
  // open latency unchanged.
  const [msgsRes, resRes, guestRes, notesRes] = await Promise.all([
    sb
      .from('beithady_messages')
      .select(
        'id, channel, external_id, direction, module_type, module_subject, body, is_automatic, from_full_name, from_type, template_name, attachments, ai_classification, ai_used_for_auto_send, sent_at, created_at'
      )
      .eq('conversation_id', conversationId)
      .order('sent_at', { ascending: true, nullsFirst: false })
      .limit(500),
    header.reservation_id
      ? sb
          .from('guesty_reservations')
          .select(
            'id, status, source, confirmation_code, platform_confirmation_code, check_in_date, check_out_date, nights, guests, currency, guest_paid, host_payout'
          )
          .eq('id', header.reservation_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    header.guest_id
      ? sb
          .from('beithady_guests')
          .select('lifetime_stays, lifetime_nights, lifetime_spend_usd, vip, loyalty_tier, last_seen, language')
          .eq('id', header.guest_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    sb
      .from('beithady_conversation_notes')
      .select('id, author_user_id, body, created_at, app_users(username)')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(50),
  ]);

  type NoteRow = {
    id: string;
    author_user_id: string;
    body: string;
    created_at: string;
    app_users: { username: string } | { username: string }[] | null;
  };
  const notes: ThreadNote[] = ((notesRes.data as NoteRow[] | null) || []).map(n => {
    const u = n.app_users;
    const username = Array.isArray(u) ? u[0]?.username : u?.username;
    return {
      id: n.id,
      author_user_id: n.author_user_id,
      author_username: username || null,
      body: n.body,
      created_at: n.created_at,
    };
  });

  return {
    header,
    messages: (msgsRes.data as ThreadMessage[] | null) || [],
    reservation: (resRes.data as ThreadReservation | null) || null,
    guestStats: (guestRes.data as ThreadGuestStats | null) || null,
    notes,
  };
}

export async function getInboxStats(channel?: Channel): Promise<{
  open: number;
  unread: number;
  breach: number;
  red: number;
  orange: number;
  yellow: number;
  green: number;
  by_source: Array<{ source: string; count: number }>;
}> {
  const sb = supabaseAdmin();
  // Helper: build a count-only query for open conversations on (optionally) a channel.
  const countWhere = (
    extras: (q: ReturnType<typeof openQuery>) => ReturnType<typeof openQuery>
  ) => extras(openQuery());
  function openQuery() {
    let q = sb
      .from('beithady_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('state', 'open')
      .is('archived_at', null);
    if (channel) q = q.eq('channel', channel);
    return q;
  }
  function sourceQuery() {
    let q = sb
      .from('beithady_conversations')
      .select('source')
      .not('source', 'is', null)
      .eq('state', 'open')
      .is('archived_at', null);
    if (channel) q = q.eq('channel', channel);
    return q;
  }

  const [{ count: open }, { count: unread }, { count: breach }, { count: red }, { count: orange }, { count: yellow }, { count: green }, { data: sourceRows }] = await Promise.all([
    countWhere(q => q),
    countWhere(q => q.gt('unread_count', 0)),
    countWhere(q => q.eq('sla_breach', true)),
    countWhere(q => q.eq('sla_bucket', 'red')),
    countWhere(q => q.eq('sla_bucket', 'orange')),
    countWhere(q => q.eq('sla_bucket', 'yellow')),
    countWhere(q => q.eq('sla_bucket', 'green')),
    sourceQuery(),
  ]);

  const tally = new Map<string, number>();
  for (const r of (sourceRows as Array<{ source: string }> | null) || []) {
    tally.set(r.source, (tally.get(r.source) || 0) + 1);
  }
  const by_source = Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([source, count]) => ({ source, count }));

  return {
    open: open ?? 0,
    unread: unread ?? 0,
    breach: breach ?? 0,
    red: red ?? 0,
    orange: orange ?? 0,
    yellow: yellow ?? 0,
    green: green ?? 0,
    by_source,
  };
}

// =====================================================================
// Phase R — Archive aggregation helpers
// =====================================================================

export type ArchiveYearStat = {
  year: number;
  count: number;
};

export type ArchiveMonthStat = {
  year: number;
  month: number;          // 1-12
  count: number;
};

// Total archived count (used by tab badge).
export async function getArchiveTotalCount(channel?: Channel): Promise<number> {
  const sb = supabaseAdmin();
  let q = sb
    .from('beithady_conversations')
    .select('id', { count: 'exact', head: true })
    .not('archived_at', 'is', null);
  if (channel) q = q.eq('channel', channel);
  const { count } = await q;
  return count ?? 0;
}

// Year/month aggregation for the archive landing grids. Single fetch
// of a small (year, month) aggregate column then bucketed in JS — keeps
// migration-free and works without RPC.
export async function getArchiveBuckets(channel?: Channel): Promise<{
  years: ArchiveYearStat[];
  months: ArchiveMonthStat[];
}> {
  const sb = supabaseAdmin();
  let q = sb
    .from('beithady_conversations')
    .select('modified_at_external, last_inbound_at, created_at')
    .not('archived_at', 'is', null);
  if (channel) q = q.eq('channel', channel);
  // Cap at 100k rows — far above realistic scale for this org.
  const { data } = await q.limit(100_000);
  const monthsTally = new Map<string, number>();
  const yearsTally = new Map<number, number>();
  for (const r of (data as Array<{
    modified_at_external: string | null;
    last_inbound_at: string | null;
    created_at: string;
  }> | null) || []) {
    const isoStr = r.modified_at_external || r.last_inbound_at || r.created_at;
    if (!isoStr) continue;
    const d = new Date(isoStr);
    if (Number.isNaN(d.getTime())) continue;
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth() + 1;
    yearsTally.set(y, (yearsTally.get(y) || 0) + 1);
    monthsTally.set(`${y}-${m}`, (monthsTally.get(`${y}-${m}`) || 0) + 1);
  }
  const years: ArchiveYearStat[] = Array.from(yearsTally.entries())
    .map(([year, count]) => ({ year, count }))
    .sort((a, b) => b.year - a.year);
  const months: ArchiveMonthStat[] = Array.from(monthsTally.entries())
    .map(([key, count]) => {
      const [y, m] = key.split('-').map(Number);
      return { year: y, month: m, count };
    })
    .sort((a, b) => (b.year - a.year) || (b.month - a.month));
  return { years, months };
}
