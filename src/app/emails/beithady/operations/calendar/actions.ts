'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';

export type SavedViewFilters = {
  buildings?: string[];
  channels?: string[];
  status?: string;
  risk?: string;
  q?: string;
  days?: number;
};

export async function saveViewAction(input: {
  name: string;
  scope: 'private' | 'shared';
  filters: SavedViewFilters;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { user } = await requireBeithadyPermission('operations', 'read');
  if (!input.name || input.name.length > 80) {
    return { ok: false, error: 'Name required (max 80 chars)' };
  }
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('beithady_calendar_saved_views')
    .insert({
      name: input.name.trim(),
      owner_user_id: user.id,
      scope: input.scope,
      filters_json: input.filters,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath('/emails/beithady/operations/calendar');
  return { ok: true, id: (data as { id: string }).id };
}

export async function deleteViewAction(viewId: string): Promise<{ ok: boolean; error?: string }> {
  const { user } = await requireBeithadyPermission('operations', 'read');
  const sb = supabaseAdmin();
  // Owners can delete their own views; admins (handled inside requireBeithadyPermission)
  // bypass via the elevated role; but we still scope to owner_user_id for safety.
  const { error } = await sb
    .from('beithady_calendar_saved_views')
    .delete()
    .eq('id', viewId)
    .eq('owner_user_id', user.id);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/emails/beithady/operations/calendar');
  return { ok: true };
}

export type SavedView = {
  id: string;
  name: string;
  scope: 'private' | 'shared';
  filters_json: SavedViewFilters;
  is_mine: boolean;
};

export async function listViews(): Promise<SavedView[]> {
  const { user } = await requireBeithadyPermission('operations', 'read');
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_calendar_saved_views')
    .select('id, name, scope, filters_json, owner_user_id')
    .or(`owner_user_id.eq.${user.id},scope.eq.shared`)
    .order('name');
  return ((data as Array<{
    id: string;
    name: string;
    scope: 'private' | 'shared';
    filters_json: SavedViewFilters;
    owner_user_id: string;
  }> | null) || []).map(v => ({
    id: v.id,
    name: v.name,
    scope: v.scope,
    filters_json: v.filters_json || {},
    is_mine: v.owner_user_id === user.id,
  }));
}
