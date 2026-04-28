'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { recordAudit } from '@/lib/beithady/audit';
import type { RuleScope, FormulaKind } from '@/lib/beithady/inventory/rules';

export type RuleFormInput = {
  scope: RuleScope;
  scope_value: string | null;
  item_id: string;
  formula_kind: FormulaKind;
  qty: number;
  loss_factor_pct: number;
  notes: string | null;
};

export type RuleActionResult = { ok: true; rule_id: string } | { ok: false; error: string };

function validate(input: RuleFormInput): string | null {
  if (!input.item_id) return 'Item is required';
  if (input.qty <= 0) return 'Qty must be > 0';
  if (input.loss_factor_pct < 0 || input.loss_factor_pct > 100) return 'Loss factor must be 0-100';
  if (input.scope !== 'global' && !input.scope_value) {
    return `${input.scope} scope requires a scope value`;
  }
  return null;
}

export async function createRuleAction(input: RuleFormInput): Promise<RuleActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('beithady_inventory_consumption_rules')
    .insert({
      scope: input.scope,
      scope_value: input.scope === 'global' ? null : input.scope_value,
      item_id: input.item_id,
      formula_kind: input.formula_kind,
      qty: input.qty,
      loss_factor_pct: input.loss_factor_pct,
      notes: input.notes,
      created_by_user: user.id,
    })
    .select('id')
    .single();

  if (error || !data) {
    if (error?.message?.includes('duplicate') || error?.message?.includes('unique')) {
      return { ok: false, error: 'A rule for this scope/item/formula combination already exists. Edit it instead.' };
    }
    return { ok: false, error: error?.message || 'Insert failed' };
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'rule.create',
    target_type: 'consumption_rule',
    target_id: data.id,
    after: input,
  });

  revalidatePath('/beithady/inventory/rules');
  revalidatePath('/beithady/inventory/dashboard');
  revalidatePath('/beithady/inventory');
  return { ok: true, rule_id: data.id };
}

export async function updateRuleAction(id: string, patch: Partial<RuleFormInput>): Promise<RuleActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();
  const { data: before } = await sb.from('beithady_inventory_consumption_rules').select('*').eq('id', id).maybeSingle();
  if (!before) return { ok: false, error: 'Rule not found' };

  const update: Record<string, unknown> = {};
  for (const k of Object.keys(patch) as Array<keyof RuleFormInput>) {
    update[k] = patch[k];
  }

  const { data, error } = await sb
    .from('beithady_inventory_consumption_rules')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error || !data) return { ok: false, error: error?.message || 'Update failed' };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'rule.update',
    target_type: 'consumption_rule',
    target_id: id,
    before,
    after: data,
  });
  revalidatePath('/beithady/inventory/rules');
  revalidatePath('/beithady/inventory/dashboard');
  return { ok: true, rule_id: id };
}

export async function toggleRuleActiveAction(id: string): Promise<RuleActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();
  const { data: before } = await sb.from('beithady_inventory_consumption_rules').select('*').eq('id', id).maybeSingle();
  if (!before) return { ok: false, error: 'Rule not found' };

  const { data, error } = await sb
    .from('beithady_inventory_consumption_rules')
    .update({ active: !before.active })
    .eq('id', id)
    .select('*')
    .single();
  if (error || !data) return { ok: false, error: error?.message || 'Toggle failed' };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: before.active ? 'rule.deactivate' : 'rule.activate',
    target_type: 'consumption_rule',
    target_id: id,
    before,
    after: data,
  });
  revalidatePath('/beithady/inventory/rules');
  revalidatePath('/beithady/inventory/dashboard');
  return { ok: true, rule_id: id };
}

export async function deleteRuleAction(id: string): Promise<RuleActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();
  const { data: before } = await sb.from('beithady_inventory_consumption_rules').select('*').eq('id', id).maybeSingle();
  if (!before) return { ok: false, error: 'Rule not found' };

  const { error } = await sb.from('beithady_inventory_consumption_rules').delete().eq('id', id);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'rule.delete',
    target_type: 'consumption_rule',
    target_id: id,
    before,
  });
  revalidatePath('/beithady/inventory/rules');
  revalidatePath('/beithady/inventory/dashboard');
  return { ok: true, rule_id: id };
}
