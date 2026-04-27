'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { recordAudit } from '@/lib/beithady/audit';
import { syncBeithadyGuests, refreshTimelineForGuest } from '@/lib/beithady/crm/guests-sync';
import { createSegment } from '@/lib/beithady/crm/segments';
import { generateGuestSummary, persistGuestSummary } from '@/lib/beithady/crm/ai-summary';
import type { GuestListFilter } from '@/lib/beithady/crm/guest-list';

async function requireCrmFull() {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const ok = user.is_admin || (await hasBeithadyPermission(user, 'crm', 'full'));
  if (!ok) throw new Error('forbidden');
  return user;
}

async function requireCrmRead() {
  const user = await getCurrentUser();
  if (!user) throw new Error('not_authenticated');
  const ok = user.is_admin || (await hasBeithadyPermission(user, 'crm', 'read'));
  if (!ok) throw new Error('forbidden');
  return user;
}

function parseGuestIds(formData: FormData): string[] {
  const raw = formData.getAll('guest_ids');
  return raw.map(v => String(v).trim()).filter(s => s.length > 0);
}

export async function bulkTagAction(formData: FormData): Promise<void> {
  const user = await requireCrmFull();
  const ids = parseGuestIds(formData);
  const action = String(formData.get('bulk_action') || 'add'); // 'add' | 'remove'
  const tagsRaw = String(formData.get('tags') || '');
  const tags = tagsRaw
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0 && t.length <= 32);
  if (!ids.length || !tags.length) return;

  const sb = supabaseAdmin();
  const { data: rows } = await sb
    .from('beithady_guests')
    .select('id, tags')
    .in('id', ids);
  for (const r of (rows as Array<{ id: string; tags: string[] | null }> | null) || []) {
    const current = new Set<string>(r.tags || []);
    if (action === 'add') tags.forEach(t => current.add(t));
    else tags.forEach(t => current.delete(t));
    await sb.from('beithady_guests').update({ tags: Array.from(current) }).eq('id', r.id);
  }
  await recordAudit({
    actor_user_id: user.id,
    module: 'crm',
    action: action === 'add' ? 'guests_tags_added' : 'guests_tags_removed',
    target_type: 'guests_bulk',
    metadata: { guest_count: ids.length, tags },
  });
  revalidatePath('/emails/beithady/crm');
}

export async function toggleVipAction(formData: FormData): Promise<void> {
  const user = await requireCrmFull();
  const id = String(formData.get('guest_id') || '');
  if (!id) return;
  const sb = supabaseAdmin();
  const { data: row } = await sb
    .from('beithady_guests')
    .select('vip')
    .eq('id', id)
    .maybeSingle();
  const before = (row as { vip: boolean } | null)?.vip ?? false;
  const after = !before;
  await sb.from('beithady_guests').update({ vip: after }).eq('id', id);
  await recordAudit({
    actor_user_id: user.id,
    module: 'crm',
    action: after ? 'guest_marked_vip' : 'guest_unmarked_vip',
    target_type: 'guest',
    target_id: id,
    before: { vip: before },
    after: { vip: after },
  });
  revalidatePath(`/emails/beithady/crm/${id}`);
  revalidatePath('/emails/beithady/crm');
}

export async function addNoteAction(formData: FormData): Promise<void> {
  const user = await requireCrmFull();
  const id = String(formData.get('guest_id') || '');
  const body = String(formData.get('body') || '').trim();
  const pinned = formData.get('pinned') !== null;
  if (!id || !body) return;
  const sb = supabaseAdmin();
  const { data: noteIns } = await sb
    .from('beithady_guest_notes')
    .insert({
      guest_id: id,
      author_user_id: user.id,
      body,
      pinned,
    })
    .select('id')
    .single();
  await recordAudit({
    actor_user_id: user.id,
    module: 'crm',
    action: 'guest_note_added',
    target_type: 'guest',
    target_id: id,
    after: { note_id: (noteIns as { id: string } | null)?.id, pinned },
  });
  // Refresh timeline cache so the new note appears immediately on the
  // 360° page without waiting for the daily sync.
  try {
    await refreshTimelineForGuest(id);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[addNoteAction] timeline refresh failed:', e);
  }
  revalidatePath(`/emails/beithady/crm/${id}`);
}

export async function deleteNoteAction(formData: FormData): Promise<void> {
  const user = await requireCrmFull();
  const noteId = String(formData.get('note_id') || '');
  const guestId = String(formData.get('guest_id') || '');
  if (!noteId) return;
  const sb = supabaseAdmin();
  await sb.from('beithady_guest_notes').delete().eq('id', noteId);
  await recordAudit({
    actor_user_id: user.id,
    module: 'crm',
    action: 'guest_note_deleted',
    target_type: 'note',
    target_id: noteId,
    metadata: { guest_id: guestId },
  });
  if (guestId) {
    try {
      await refreshTimelineForGuest(guestId);
    } catch {
      // best effort
    }
    revalidatePath(`/emails/beithady/crm/${guestId}`);
  }
}

export async function regenerateAiSummaryAction(formData: FormData): Promise<void> {
  const user = await requireCrmFull();
  const id = String(formData.get('guest_id') || '');
  if (!id) return;
  const sb = supabaseAdmin();
  const { data: profile } = await sb
    .from('beithady_guests')
    .select('full_name, residence_country, language, lifetime_stays, lifetime_nights, loyalty_tier, vip, source_signals, tags')
    .eq('id', id)
    .maybeSingle();
  if (!profile) return;
  const { data: cache } = await sb
    .from('beithady_guest_timeline_cache')
    .select('events')
    .eq('guest_id', id)
    .maybeSingle();
  const events = ((cache as { events?: Array<{ type: string; title: string; at: string }> } | null)?.events) || [];
  const summary = await generateGuestSummary({
    full_name: (profile as { full_name: string | null }).full_name,
    residence_country: (profile as { residence_country: string | null }).residence_country,
    language: (profile as { language: string | null }).language,
    lifetime_stays: (profile as { lifetime_stays: number }).lifetime_stays,
    lifetime_nights: (profile as { lifetime_nights: number }).lifetime_nights,
    loyalty_tier: (profile as { loyalty_tier: string }).loyalty_tier,
    vip: (profile as { vip: boolean }).vip,
    source_signals: (profile as { source_signals: { sources?: string[]; is_returning_per_guesty?: boolean } }).source_signals,
    tags: (profile as { tags: string[] }).tags,
    recent_events: events.slice(0, 8),
  });
  await persistGuestSummary(id, summary);
  await recordAudit({
    actor_user_id: user.id,
    module: 'crm',
    action: 'guest_ai_summary_regenerated',
    target_type: 'guest',
    target_id: id,
  });
  revalidatePath(`/emails/beithady/crm/${id}`);
}

export async function createSegmentAction(formData: FormData): Promise<void> {
  const user = await requireCrmRead();
  const name = String(formData.get('name') || '').trim();
  if (!name) return;
  const description = String(formData.get('description') || '').trim() || undefined;
  const shared = formData.get('shared') !== null;

  // Filter: build from form fields prefixed with `f_`
  const filter: GuestListFilter = {};
  const search = String(formData.get('f_search') || '').trim();
  if (search) filter.search = search;
  const countries = String(formData.get('f_countries') || '')
    .split(',')
    .map(s => s.trim().toUpperCase())
    .filter(Boolean);
  if (countries.length) filter.countries = countries;
  const tiers = formData.getAll('f_tiers').map(v => String(v));
  if (tiers.length) filter.tiers = tiers as GuestListFilter['tiers'];
  if (formData.get('f_vipOnly') !== null) filter.vipOnly = true;
  if (formData.get('f_hasFutureBooking') !== null) filter.hasFutureBooking = true;
  const minStays = parseInt(String(formData.get('f_minStays') || ''), 10);
  if (Number.isFinite(minStays) && minStays > 0) filter.minStays = minStays;

  const seg = await createSegment({
    name,
    description,
    filter,
    ownerUserId: user.id,
    shared,
  });
  await recordAudit({
    actor_user_id: user.id,
    module: 'crm',
    action: 'segment_created',
    target_type: 'segment',
    target_id: seg.id,
    after: { name: seg.name, filter: seg.filter, shared: seg.shared },
  });
  redirect(`/emails/beithady/crm/segments/${seg.id}`);
}

export async function runCrmSyncAction(): Promise<void> {
  const user = await requireCrmFull();
  const result = await syncBeithadyGuests({ trigger: 'manual' });
  await recordAudit({
    actor_user_id: user.id,
    module: 'crm',
    action: 'crm_sync_manual',
    target_type: 'crm_run',
    target_id: result.run_id,
    metadata: result,
  });
  revalidatePath('/emails/beithady/crm');
}
