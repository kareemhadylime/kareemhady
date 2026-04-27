import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import { refreshTimelineForGuest, type TimelineEvent } from './guests-sync';

// Single-guest 360° loader. Reads the timeline cache for fast render;
// regenerates the cache lazily if missing or older than 1 hour.

const TIMELINE_TTL_MS = 60 * 60 * 1000;

export type GuestProfile = {
  id: string;
  guesty_guest_id: string | null;
  full_name: string | null;
  email: string | null;
  phone_e164: string | null;
  language: string | null;
  residence_country: string | null;
  residence_city: string | null;
  marketing_opt_in: boolean;
  vip: boolean;
  loyalty_tier: 'none' | 'bronze' | 'silver' | 'gold' | 'platinum';
  lifetime_stays: number;
  lifetime_nights: number;
  lifetime_spend_usd: number;
  first_seen: string | null;
  last_seen: string | null;
  next_arrival_at: string | null;
  preferred_channel: string | null;
  custom_fields: Record<string, unknown>;
  tags: string[];
  ai_summary: string | null;
  ai_summary_updated_at: string | null;
  source_signals: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type GuestNote = {
  id: string;
  guest_id: string;
  author_user_id: string | null;
  author_username: string | null;
  body: string;
  pinned: boolean;
  created_at: string;
  updated_at: string;
};

export type GuestTimeline = {
  events: TimelineEvent[];
  bookings_count: number;
  messages_count: number;
  reviews_count: number;
  notes_count: number;
  refreshed_at: string;
};

export type GuestBundle = {
  profile: GuestProfile;
  notes: GuestNote[];
  timeline: GuestTimeline;
};

export async function loadGuestBundle(guestId: string): Promise<GuestBundle | null> {
  const sb = supabaseAdmin();

  const { data: profile } = await sb
    .from('beithady_guests')
    .select('*')
    .eq('id', guestId)
    .maybeSingle();
  if (!profile) return null;

  // Notes — joined with author username for display.
  const { data: noteRows } = await sb
    .from('beithady_guest_notes')
    .select('id, guest_id, author_user_id, body, pinned, created_at, updated_at')
    .eq('guest_id', guestId)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(100);
  const authorIds = Array.from(
    new Set(
      ((noteRows as Array<{ author_user_id: string | null }> | null) || [])
        .map(n => n.author_user_id)
        .filter((x): x is string => !!x)
    )
  );
  const usernameById = new Map<string, string>();
  if (authorIds.length) {
    const { data: users } = await sb
      .from('app_users')
      .select('id, username')
      .in('id', authorIds);
    for (const u of (users as Array<{ id: string; username: string }> | null) || []) {
      usernameById.set(u.id, u.username);
    }
  }
  const notes: GuestNote[] = ((noteRows as Array<{
    id: string;
    guest_id: string;
    author_user_id: string | null;
    body: string;
    pinned: boolean;
    created_at: string;
    updated_at: string;
  }> | null) || []).map(n => ({
    ...n,
    author_username: n.author_user_id ? usernameById.get(n.author_user_id) || null : null,
  }));

  // Timeline cache — refresh lazily if stale
  let { data: cache } = await sb
    .from('beithady_guest_timeline_cache')
    .select('events, bookings_count, messages_count, reviews_count, notes_count, refreshed_at')
    .eq('guest_id', guestId)
    .maybeSingle();
  const isStale =
    !cache ||
    Date.now() - new Date((cache as { refreshed_at: string }).refreshed_at).getTime() > TIMELINE_TTL_MS;
  if (isStale) {
    try {
      await refreshTimelineForGuest(guestId);
      const { data: fresh } = await sb
        .from('beithady_guest_timeline_cache')
        .select('events, bookings_count, messages_count, reviews_count, notes_count, refreshed_at')
        .eq('guest_id', guestId)
        .maybeSingle();
      cache = fresh;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn(`[guest-loader] timeline refresh failed for ${guestId}:`, e);
    }
  }

  const timeline: GuestTimeline = cache
    ? {
        events: ((cache as { events: TimelineEvent[] }).events) || [],
        bookings_count: (cache as { bookings_count: number }).bookings_count || 0,
        messages_count: (cache as { messages_count: number }).messages_count || 0,
        reviews_count: (cache as { reviews_count: number }).reviews_count || 0,
        notes_count: (cache as { notes_count: number }).notes_count || 0,
        refreshed_at: (cache as { refreshed_at: string }).refreshed_at,
      }
    : {
        events: [],
        bookings_count: 0,
        messages_count: 0,
        reviews_count: 0,
        notes_count: 0,
        refreshed_at: new Date().toISOString(),
      };

  return {
    profile: profile as GuestProfile,
    notes,
    timeline,
  };
}
