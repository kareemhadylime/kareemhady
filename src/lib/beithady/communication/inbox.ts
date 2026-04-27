import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { SlaBucket } from './sla';

// Server-side queries powering the Communication tabs. Reads from
// beithady_conversations + beithady_messages exclusively — those are
// the canonical channel-agnostic mirrors.

export type Channel = 'guesty' | 'wa_cloud' | 'wa_casual';

export type InboxFilter = {
  channel?: Channel;
  search?: string;          // matches guest_full_name | guest_email | guest_phone | listing_nickname
  building?: string;
  source?: string;          // airbnb | booking.com | direct | ...
  slaBucket?: SlaBucket;    // 'red' to surface breaches
  unreadOnly?: boolean;
  state?: 'open' | 'closed' | 'all';
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
      'id, channel, external_id, guest_id, guest_full_name, guest_email, guest_phone, listing_nickname, building_code, source, state, unread_count, tags, last_inbound_at, last_outbound_at, sla_age_seconds, sla_bucket, sla_breach, modified_at_external',
      { count: 'exact' }
    );

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
  if (f.state && f.state !== 'all') q = q.eq('state', f.state);
  else if (!f.state) q = q.eq('state', 'open');

  // Sort: open + breach first by descending age, then by most recent activity.
  q = q
    .order('sla_breach', { ascending: false })
    .order('sla_age_seconds', { ascending: false, nullsFirst: false })
    .order('modified_at_external', { ascending: false, nullsFirst: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

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
};

export type ThreadBundle = {
  header: ThreadHeader;
  messages: ThreadMessage[];
};

export async function loadThread(conversationId: string): Promise<ThreadBundle | null> {
  const sb = supabaseAdmin();
  const { data: conv } = await sb
    .from('beithady_conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();
  if (!conv) return null;

  const { data: msgs } = await sb
    .from('beithady_messages')
    .select(
      'id, channel, external_id, direction, module_type, module_subject, body, is_automatic, from_full_name, from_type, template_name, attachments, ai_classification, ai_used_for_auto_send, sent_at, created_at'
    )
    .eq('conversation_id', conversationId)
    .order('sent_at', { ascending: true, nullsFirst: false })
    .limit(500);

  return {
    header: conv as ThreadHeader,
    messages: (msgs as ThreadMessage[] | null) || [],
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
      .eq('state', 'open');
    if (channel) q = q.eq('channel', channel);
    return q;
  }
  function sourceQuery() {
    let q = sb
      .from('beithady_conversations')
      .select('source')
      .not('source', 'is', null)
      .eq('state', 'open');
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
