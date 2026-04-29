import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { Template } from './templates-shared';

// Phase Q.2 — server-side templates loader. Returns active templates
// filtered for a particular conversation channel+source. Cached at
// request scope is fine (Next.js dedupes via fetch cache; but reads
// here are direct Supabase, so re-fetch per page-render is acceptable
// at our scale — templates table holds <100 rows).

export async function listActiveTemplates(): Promise<Template[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_message_templates')
    .select('id, name, channel, source_filter, language, category, body, sort_order, active')
    .eq('active', true)
    .order('sort_order', { ascending: true })
    .limit(200);
  return (data as Template[] | null) || [];
}

export type ListingSecrets = {
  wifi_ssid: string | null;
  wifi_password: string | null;
  gate_code: string | null;
  parking_notes: string | null;
  checkin_time: string | null;
};

export async function getListingSecrets(listingId: string | null): Promise<ListingSecrets | null> {
  if (!listingId) return null;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_listing_secrets')
    .select('wifi_ssid, wifi_password, gate_code, parking_notes, checkin_time')
    .eq('listing_id', listingId)
    .maybeSingle();
  return (data as ListingSecrets | null) || null;
}

// Admin CRUD helpers (used by Q.2.5 page).
export async function listAllTemplates(): Promise<Template[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_message_templates')
    .select('id, name, channel, source_filter, language, category, body, sort_order, active')
    .order('active', { ascending: false })
    .order('sort_order', { ascending: true })
    .limit(500);
  return (data as Template[] | null) || [];
}

export async function getTemplate(id: string): Promise<Template | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_message_templates')
    .select('id, name, channel, source_filter, language, category, body, sort_order, active')
    .eq('id', id)
    .maybeSingle();
  return (data as Template | null) || null;
}
