import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { LoyaltyTier } from './loyalty';

// Guest list query — paginated, filterable. Powers the CRM landing
// table + segment execution + bulk action targeting.

export type GuestListFilter = {
  search?: string;            // matches name | email | phone
  countries?: string[];       // ISO alpha-2 or full country names
  tiers?: LoyaltyTier[];
  sources?: string[];         // 'airbnb' | 'booking.com' | 'direct' | ...
  vipOnly?: boolean;
  hasFutureBooking?: boolean;
  minStays?: number;
  hasConversation?: boolean;
};

export type GuestListSort =
  | 'last_seen_desc'
  | 'next_arrival_asc'
  | 'lifetime_stays_desc'
  | 'lifetime_spend_desc'
  | 'name_asc';

export type GuestListRow = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone_e164: string | null;
  residence_country: string | null;
  loyalty_tier: LoyaltyTier;
  lifetime_stays: number;
  lifetime_nights: number;
  lifetime_spend_usd: number;
  first_seen: string | null;
  last_seen: string | null;
  next_arrival_at: string | null;
  vip: boolean;
  tags: string[];
  source_signals: { has_conversation?: boolean; reservation_count?: number; sources?: string[] } | null;
};

export type GuestListResult = {
  rows: GuestListRow[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listGuests(opts: {
  filter?: GuestListFilter;
  sort?: GuestListSort;
  page?: number;
  pageSize?: number;
} = {}): Promise<GuestListResult> {
  const sb = supabaseAdmin();
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.max(10, Math.min(200, opts.pageSize ?? 50));
  const sort = opts.sort ?? 'last_seen_desc';
  const f = opts.filter ?? {};

  let q = sb
    .from('beithady_guests')
    .select(
      'id, full_name, email, phone_e164, residence_country, loyalty_tier, lifetime_stays, lifetime_nights, lifetime_spend_usd, first_seen, last_seen, next_arrival_at, vip, tags, source_signals',
      { count: 'exact' }
    );

  if (f.search && f.search.trim()) {
    const s = f.search.trim();
    q = q.or(
      `full_name.ilike.%${s}%,email.ilike.%${s}%,phone_e164.ilike.%${s.replace(/[^0-9+]/g, '')}%`
    );
  }
  if (f.countries && f.countries.length) {
    q = q.in('residence_country', f.countries);
  }
  if (f.tiers && f.tiers.length) {
    q = q.in('loyalty_tier', f.tiers);
  }
  if (f.vipOnly) {
    q = q.eq('vip', true);
  }
  if (f.hasFutureBooking) {
    q = q.gte('next_arrival_at', new Date().toISOString());
  }
  if (f.minStays && f.minStays > 0) {
    q = q.gte('lifetime_stays', f.minStays);
  }
  if (f.hasConversation) {
    // source_signals.has_conversation == true
    q = q.eq('source_signals->>has_conversation', 'true');
  }
  if (f.sources && f.sources.length) {
    // We can't easily query inside source_signals.sources[] with the
    // PostgREST builder. Fall back to a generic contains on the whole
    // jsonb array — this matches if any of the user-selected sources
    // appear in the guest's signal sources.
    const orParts = f.sources.map(s => `source_signals->sources.cs.["${s}"]`);
    q = q.or(orParts.join(','));
  }

  switch (sort) {
    case 'last_seen_desc':
      q = q.order('last_seen', { ascending: false, nullsFirst: false });
      break;
    case 'next_arrival_asc':
      q = q.order('next_arrival_at', { ascending: true, nullsFirst: false });
      break;
    case 'lifetime_stays_desc':
      q = q.order('lifetime_stays', { ascending: false });
      break;
    case 'lifetime_spend_desc':
      q = q.order('lifetime_spend_usd', { ascending: false });
      break;
    case 'name_asc':
      q = q.order('full_name', { ascending: true, nullsFirst: false });
      break;
  }

  q = q.range((page - 1) * pageSize, page * pageSize - 1);

  const { data, count } = await q;
  return {
    rows: ((data as GuestListRow[] | null) || []),
    total: count ?? 0,
    page,
    pageSize,
  };
}

// Smart-widgets aggregate counts — used by CRM landing dashboard. Single
// roundtrip for all the small counters at the top of the page.
export async function getDashboardStats(): Promise<{
  total_guests: number;
  returning_guests: number;
  vip_count: number;
  next_30d_arrivals: number;
  top_countries: Array<{ country: string; count: number }>;
}> {
  const sb = supabaseAdmin();

  const [{ count: total }, { count: returning }, { count: vip }, { count: next30 }] =
    await Promise.all([
      sb.from('beithady_guests').select('id', { count: 'exact', head: true }),
      sb.from('beithady_guests').select('id', { count: 'exact', head: true }).gte('lifetime_stays', 2),
      sb.from('beithady_guests').select('id', { count: 'exact', head: true }).eq('vip', true),
      sb
        .from('beithady_guests')
        .select('id', { count: 'exact', head: true })
        .gte('next_arrival_at', new Date().toISOString())
        .lte('next_arrival_at', new Date(Date.now() + 30 * 86400e3).toISOString()),
    ]);

  // Top 5 countries by guest count — uses the index on residence_country.
  // PostgREST doesn't expose GROUP BY directly, so we pull a sample and
  // bucket in memory. For ~thousands of guests this is cheap.
  const { data: rows } = await sb
    .from('beithady_guests')
    .select('residence_country')
    .not('residence_country', 'is', null)
    .limit(10000);
  const tally = new Map<string, number>();
  for (const r of ((rows as Array<{ residence_country: string }> | null) || [])) {
    tally.set(r.residence_country, (tally.get(r.residence_country) || 0) + 1);
  }
  const topCountries = Array.from(tally.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([country, count]) => ({ country, count }));

  return {
    total_guests: total ?? 0,
    returning_guests: returning ?? 0,
    vip_count: vip ?? 0,
    next_30d_arrivals: next30 ?? 0,
    top_countries: topCountries,
  };
}

// Country flag emoji for ISO alpha-2. Falls through to a simple
// uppercased string for non-ISO values.
export function flagFor(country: string | null): string {
  if (!country) return '·';
  const c = country.trim().toUpperCase();
  if (c.length !== 2 || !/^[A-Z]{2}$/.test(c)) return c.slice(0, 3).toUpperCase();
  // Regional Indicator Symbol Letters — A=0x1F1E6
  const codePoints = [c.charCodeAt(0) + 0x1F1A5, c.charCodeAt(1) + 0x1F1A5];
  return String.fromCodePoint(...codePoints);
}
