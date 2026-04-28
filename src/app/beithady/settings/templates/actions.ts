'use server';

import { revalidatePath } from 'next/cache';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { recordAudit } from '@/lib/beithady/audit';

// Pre-arrival template editing + approval. Approving freezes a copy
// of the current body into approved_body so senders can detect
// post-approval edits and refuse to fire on stale-approved content.

export async function updatePreArrivalBodyAction(
  id: string,
  newBody: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireBeithadyPermission('settings', 'full');
  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from('beithady_pre_arrival_templates')
    .select('id, body, building_code')
    .eq('id', id)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'template_not_found' };
  const before = existing as { id: string; body: string; building_code: string | null };
  const { error } = await sb
    .from('beithady_pre_arrival_templates')
    .update({ body: newBody, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    actor_user_id: session.user.id,
    module: 'settings',
    action: 'pre_arrival_template_edited',
    target_type: 'beithady_pre_arrival_templates',
    target_id: id,
    before: { body: before.body },
    after: { body: newBody },
    metadata: { building_code: before.building_code, note: 'Trigger cleared approval; template re-enters review queue' },
  });
  revalidatePath('/beithady/settings/templates');
  return { ok: true };
}

export async function approvePreArrivalTemplateAction(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireBeithadyPermission('settings', 'full');
  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from('beithady_pre_arrival_templates')
    .select('id, body, building_code')
    .eq('id', id)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'template_not_found' };
  const t = existing as { id: string; body: string; building_code: string | null };
  // Set approved_body = current body, mark approved_at, do NOT auto-enable.
  // Operator must take a separate explicit action to enable cron-fire.
  const { error } = await sb
    .from('beithady_pre_arrival_templates')
    .update({
      approved_body: t.body,
      approved_at: new Date().toISOString(),
      approved_by_user: session.user.id,
    })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    actor_user_id: session.user.id,
    module: 'settings',
    action: 'pre_arrival_template_approved',
    target_type: 'beithady_pre_arrival_templates',
    target_id: id,
    metadata: { building_code: t.building_code, body_length: t.body.length },
  });
  revalidatePath('/beithady/settings/templates');
  return { ok: true };
}

export async function setPreArrivalEnabledAction(
  id: string,
  enabled: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireBeithadyPermission('settings', 'full');
  const sb = supabaseAdmin();
  if (enabled) {
    // Refuse to enable an unapproved template
    const { data } = await sb
      .from('beithady_pre_arrival_templates')
      .select('approved_at, body, approved_body')
      .eq('id', id)
      .maybeSingle();
    const row = data as { approved_at: string | null; body: string; approved_body: string | null } | null;
    if (!row) return { ok: false, error: 'template_not_found' };
    if (!row.approved_at) return { ok: false, error: 'cannot_enable_unapproved_template' };
    if (row.body !== row.approved_body) return { ok: false, error: 'body_does_not_match_approved_body' };
  }
  const { error } = await sb
    .from('beithady_pre_arrival_templates')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    actor_user_id: session.user.id,
    module: 'settings',
    action: enabled ? 'pre_arrival_template_enabled' : 'pre_arrival_template_disabled',
    target_type: 'beithady_pre_arrival_templates',
    target_id: id,
  });
  revalidatePath('/beithady/settings/templates');
  return { ok: true };
}

// Upsell catalog mirror

export async function updateUpsellAction(
  id: string,
  fields: { name: string; description: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireBeithadyPermission('settings', 'full');
  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from('beithady_upsell_catalog')
    .select('id, name, description, sku')
    .eq('id', id)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'upsell_not_found' };
  const before = existing as { id: string; name: string; description: string; sku: string };
  const { error } = await sb
    .from('beithady_upsell_catalog')
    .update({ name: fields.name, description: fields.description, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    actor_user_id: session.user.id,
    module: 'settings',
    action: 'upsell_edited',
    target_type: 'beithady_upsell_catalog',
    target_id: id,
    before: { name: before.name, description: before.description },
    after: fields,
    metadata: { sku: before.sku },
  });
  revalidatePath('/beithady/settings/templates');
  return { ok: true };
}

export async function approveUpsellAction(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireBeithadyPermission('settings', 'full');
  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from('beithady_upsell_catalog')
    .select('id, name, description, sku')
    .eq('id', id)
    .maybeSingle();
  if (!existing) return { ok: false, error: 'upsell_not_found' };
  const t = existing as { id: string; name: string; description: string; sku: string };
  const { error } = await sb
    .from('beithady_upsell_catalog')
    .update({
      approved_name: t.name,
      approved_description: t.description,
      approved_at: new Date().toISOString(),
      approved_by_user: session.user.id,
    })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    actor_user_id: session.user.id,
    module: 'settings',
    action: 'upsell_approved',
    target_type: 'beithady_upsell_catalog',
    target_id: id,
    metadata: { sku: t.sku },
  });
  revalidatePath('/beithady/settings/templates');
  return { ok: true };
}

export async function setUpsellEnabledAction(
  id: string,
  enabled: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireBeithadyPermission('settings', 'full');
  const sb = supabaseAdmin();
  if (enabled) {
    const { data } = await sb
      .from('beithady_upsell_catalog')
      .select('approved_at, name, description, approved_name, approved_description')
      .eq('id', id)
      .maybeSingle();
    const row = data as { approved_at: string | null; name: string; description: string; approved_name: string | null; approved_description: string | null } | null;
    if (!row) return { ok: false, error: 'upsell_not_found' };
    if (!row.approved_at) return { ok: false, error: 'cannot_enable_unapproved_upsell' };
    if (row.name !== row.approved_name || row.description !== row.approved_description) {
      return { ok: false, error: 'fields_do_not_match_approved_copy' };
    }
  }
  const { error } = await sb
    .from('beithady_upsell_catalog')
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    actor_user_id: session.user.id,
    module: 'settings',
    action: enabled ? 'upsell_enabled' : 'upsell_disabled',
    target_type: 'beithady_upsell_catalog',
    target_id: id,
  });
  revalidatePath('/beithady/settings/templates');
  return { ok: true };
}

// Global outbound kill switch — flippable from the templates page banner

export async function setOutboundPausedAction(
  paused: boolean,
  reason?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await requireBeithadyPermission('settings', 'full');
  const sb = supabaseAdmin();
  await sb.from('beithady_settings').upsert([
    { key: 'beithady_outbound_paused', value: paused, updated_at: new Date().toISOString(), updated_by: session.user.id },
    { key: 'beithady_outbound_paused_reason', value: reason || (paused ? 'Manually paused via UI' : 'Manually resumed via UI'), updated_at: new Date().toISOString(), updated_by: session.user.id },
    { key: 'beithady_outbound_paused_at', value: new Date().toISOString(), updated_at: new Date().toISOString(), updated_by: session.user.id },
  ], { onConflict: 'key' });
  await recordAudit({
    actor_user_id: session.user.id,
    module: 'communication',
    action: paused ? 'outbound_paused' : 'outbound_resumed',
    target_type: 'beithady_settings',
    target_id: 'beithady_outbound_paused',
    metadata: { reason: reason || null, via: 'ui' },
  });
  revalidatePath('/beithady/settings/templates');
  revalidatePath('/beithady/communication');
  return { ok: true };
}
