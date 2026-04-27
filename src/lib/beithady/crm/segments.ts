import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { listGuests, type GuestListFilter, type GuestListRow } from './guest-list';

// Saved guest segments — JSON filter spec stored in
// beithady_guest_segments. Members are computed live by re-running
// the filter against beithady_guests; we don't materialize membership.
// `last_member_count` is updated whenever a segment is executed.

export type SegmentRow = {
  id: string;
  name: string;
  description: string | null;
  filter: GuestListFilter;
  owner_user_id: string | null;
  shared: boolean;
  last_executed_at: string | null;
  last_member_count: number | null;
  created_at: string;
  updated_at: string;
};

export async function listSegmentsVisibleTo(userId: string): Promise<SegmentRow[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_guest_segments')
    .select('*')
    .or(`owner_user_id.eq.${userId},shared.eq.true`)
    .order('updated_at', { ascending: false });
  return ((data as SegmentRow[] | null) || []);
}

export async function getSegment(id: string): Promise<SegmentRow | null> {
  const sb = supabaseAdmin();
  const { data } = await sb.from('beithady_guest_segments').select('*').eq('id', id).maybeSingle();
  return (data as SegmentRow | null) ?? null;
}

export async function createSegment(input: {
  name: string;
  description?: string;
  filter: GuestListFilter;
  ownerUserId: string;
  shared?: boolean;
}): Promise<SegmentRow> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('beithady_guest_segments')
    .insert({
      name: input.name,
      description: input.description || null,
      filter: input.filter,
      owner_user_id: input.ownerUserId,
      shared: !!input.shared,
    })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message || 'create_segment_failed');
  return data as SegmentRow;
}

export async function deleteSegment(id: string, userId: string, isAdmin: boolean): Promise<void> {
  const sb = supabaseAdmin();
  let q = sb.from('beithady_guest_segments').delete().eq('id', id);
  if (!isAdmin) q = q.eq('owner_user_id', userId);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

export async function executeSegment(id: string, opts: { page?: number; pageSize?: number } = {}): Promise<{
  segment: SegmentRow | null;
  result: Awaited<ReturnType<typeof listGuests>>;
}> {
  const seg = await getSegment(id);
  if (!seg) return { segment: null, result: { rows: [], total: 0, page: 1, pageSize: 50 } };

  const result = await listGuests({
    filter: seg.filter,
    page: opts.page,
    pageSize: opts.pageSize,
  });

  // Refresh last_executed_at + last_member_count.
  const sb = supabaseAdmin();
  await sb
    .from('beithady_guest_segments')
    .update({
      last_executed_at: new Date().toISOString(),
      last_member_count: result.total,
    })
    .eq('id', id);

  return { segment: seg, result };
}

// Materialize a segment to a CSV string suitable for HTTP download.
// Phase B keeps it server-side simple — the bulk export action streams
// this back as the response body.
export function rowsToCsv(rows: GuestListRow[]): string {
  const headers = [
    'id',
    'full_name',
    'email',
    'phone_e164',
    'residence_country',
    'loyalty_tier',
    'lifetime_stays',
    'lifetime_nights',
    'lifetime_spend_usd',
    'first_seen',
    'last_seen',
    'next_arrival_at',
    'vip',
    'tags',
  ];
  const escape = (v: unknown): string => {
    if (v == null) return '';
    const s = Array.isArray(v) ? v.join('|') : String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(
      [
        r.id,
        r.full_name,
        r.email,
        r.phone_e164,
        r.residence_country,
        r.loyalty_tier,
        r.lifetime_stays,
        r.lifetime_nights,
        r.lifetime_spend_usd,
        r.first_seen,
        r.last_seen,
        r.next_arrival_at,
        r.vip,
        r.tags,
      ]
        .map(escape)
        .join(',')
    );
  }
  return lines.join('\n');
}
