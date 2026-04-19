'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { evaluateRule } from '@/lib/rules/engine';
import { resolvePreset, type RangePreset, DOMAINS, type Domain } from '@/lib/rules/presets';

function buildRulePayload(formData: FormData) {
  const name = String(formData.get('name') || '').trim();
  if (!name) throw new Error('name_required');

  const accountIdRaw = String(formData.get('account_id') || '');
  const account_id = accountIdRaw && accountIdRaw !== 'all' ? accountIdRaw : null;

  const domainRaw = String(formData.get('domain') || '').trim().toLowerCase();
  const domain: Domain | null = (DOMAINS as readonly string[]).includes(domainRaw)
    ? (domainRaw as Domain)
    : null;

  const conditions: Record<string, unknown> = {};
  const from = String(formData.get('from_contains') || '').trim();
  const subject = String(formData.get('subject_contains') || '').trim();
  const to = String(formData.get('to_contains') || '').trim();
  const hours = parseInt(String(formData.get('time_window_hours') || '24'), 10);
  if (from) conditions.from_contains = from;
  if (subject) conditions.subject_contains = subject;
  if (to) conditions.to_contains = to;
  conditions.time_window_hours = Number.isFinite(hours) && hours > 0 ? hours : 24;

  const actionType = String(formData.get('action_type') || 'shopify_order_aggregate');
  const currency = String(formData.get('currency') || 'EGP').trim() || 'EGP';
  const mark_as_read = formData.get('mark_as_read') === 'on';
  const actions: Record<string, unknown> = { type: actionType, currency, mark_as_read };

  const enabled = formData.get('enabled') === 'on';
  const priority = parseInt(String(formData.get('priority') || '100'), 10);

  return {
    name,
    account_id,
    domain,
    conditions,
    actions,
    enabled,
    priority: Number.isFinite(priority) ? priority : 100,
  };
}

export async function createRule(formData: FormData) {
  const payload = buildRulePayload(formData);
  const sb = supabaseAdmin();
  const { error } = await sb.from('rules').insert(payload);
  if (error) throw new Error(`create_failed: ${error.message}`);
  revalidatePath('/admin/rules');
  redirect('/admin/rules');
}

export async function updateRule(id: string, formData: FormData) {
  const payload = buildRulePayload(formData);
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('rules')
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`update_failed: ${error.message}`);
  revalidatePath('/admin/rules');
  revalidatePath(`/admin/rules/${id}`);
  redirect('/admin/rules');
}

export async function deleteRule(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) throw new Error('id_required');
  const sb = supabaseAdmin();
  const { error } = await sb.from('rules').delete().eq('id', id);
  if (error) throw new Error(`delete_failed: ${error.message}`);
  revalidatePath('/admin/rules');
  revalidatePath('/emails/output');
}

function rangeFromForm(formData: FormData) {
  const preset = String(formData.get('preset') || '') as RangePreset;
  if (preset && preset !== 'custom') return resolvePreset(preset);

  const fromStr = String(formData.get('from') || '').trim();
  const toStr = String(formData.get('to') || '').trim();
  if (fromStr && toStr) {
    const fromIso = new Date(fromStr + 'T00:00:00').toISOString();
    const toIso = new Date(toStr + 'T23:59:59').toISOString();
    return { fromIso, toIso, label: `${fromStr} → ${toStr}` };
  }
  return undefined;
}

export async function runRuleAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) throw new Error('id_required');
  const range = rangeFromForm(formData);
  await evaluateRule(id, range);
  revalidatePath('/emails/output');
  revalidatePath(`/emails/output/${id}`);
  redirect(`/emails/output/${id}`);
}
