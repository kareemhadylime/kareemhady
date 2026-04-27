import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { GuestListRow } from './guest-list';

// Lightweight quick-search used by the autocomplete in the CRM landing
// header + by future Communication-tab guest linking. Matches name,
// email, phone (digits-only) and is ranked roughly by recency.

export async function quickSearchGuests(query: string, limit = 10): Promise<GuestListRow[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const sb = supabaseAdmin();
  const digits = q.replace(/[^0-9]/g, '');
  // Build OR filter: name ilike, email ilike, phone digits ilike when
  // the query has any digits.
  const orParts = [`full_name.ilike.%${q}%`, `email.ilike.%${q}%`];
  if (digits.length >= 4) {
    orParts.push(`phone_e164.ilike.%${digits}%`);
  }
  const { data } = await sb
    .from('beithady_guests')
    .select(
      'id, full_name, email, phone_e164, residence_country, loyalty_tier, lifetime_stays, lifetime_nights, lifetime_spend_usd, first_seen, last_seen, next_arrival_at, vip, tags, source_signals'
    )
    .or(orParts.join(','))
    .order('last_seen', { ascending: false, nullsFirst: false })
    .limit(limit);
  return ((data as GuestListRow[] | null) || []);
}
