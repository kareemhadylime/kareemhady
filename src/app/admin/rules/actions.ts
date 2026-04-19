'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { evaluateRule } from '@/lib/rules/engine';

function buildRulePayload(formData: FormData) {
  const name = String(formData.get('name') || '').trim();
  if (!name) throw new Error('name_required');

  const accountIdRaw = String(formData.get('account_id') || '');
  const account_id = accountIdRaw && accountIdRaw !== 'all' ? accountIdRaw : null;

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
  const actions: Record<string, unknown> = { type: actionType, currency };

  const enabled = formData.get('enabled') === 'on';
  const priority = parseInt(String(formData.get('priority') || '100'), 10);

  return {
    name,
    account_id,
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

export async function runRuleAction(formData: FormData) {
  const id = String(formData.get('id') || '');
  if (!id) throw new Error('id_required');
  await evaluateRule(id);
  revalidatePath('/emails/output');
  revalidatePath(`/emails/output/${id}`);
  redirect(`/emails/output/${id}`);
}
