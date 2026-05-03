import 'server-only';
import { supabaseAdmin } from '../supabase';

export type Skipper = {
  id: string;
  boat_id: string;
  name: string;
  whatsapp: string;
  is_default: boolean;
  active: boolean;
};

/**
 * Get the default (active) skipper for a boat. Returns null if none configured.
 * Used by notifications + manual reservation pre-fill + any UI showing the
 * "main" skipper for a boat.
 */
export async function getDefaultSkipper(boatId: string): Promise<Skipper | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('boat_rental_skippers')
    .select('id, boat_id, name, whatsapp, is_default, active')
    .eq('boat_id', boatId)
    .eq('is_default', true)
    .eq('active', true)
    .maybeSingle();
  return (data as Skipper | null) ?? null;
}

/**
 * Get all active skippers for a boat, default first.
 */
export async function getSkippersForBoat(boatId: string): Promise<Skipper[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('boat_rental_skippers')
    .select('id, boat_id, name, whatsapp, is_default, active')
    .eq('boat_id', boatId)
    .eq('active', true)
    .order('is_default', { ascending: false })
    .order('name');
  return ((data as Skipper[] | null) ?? []);
}
