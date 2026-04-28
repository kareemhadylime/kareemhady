'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { recordAudit } from '@/lib/beithady/audit';

export type TransferLineInput = {
  item_id: string;
  qty: number;
  batch_no_picked?: string;
};

export type CreateTransferInput = {
  src_warehouse_id: string;
  dst_warehouse_id: string;
  notes?: string | null;
  lines: TransferLineInput[];
};

export type TransferActionResult =
  | { ok: true; transfer_id: string; total_value_egp: number; lines_posted: number }
  | { ok: false; error: string };

export async function postTransferAction(input: CreateTransferInput): Promise<TransferActionResult> {
  const { user, roles } = await requireBeithadyPermission('inventory', 'full');

  if (!input.src_warehouse_id || !input.dst_warehouse_id) {
    return { ok: false, error: 'Source and destination warehouses are required' };
  }
  if (input.src_warehouse_id === input.dst_warehouse_id) {
    return { ok: false, error: 'Source and destination must differ' };
  }
  if (!input.lines || input.lines.length === 0) {
    return { ok: false, error: 'At least one line is required' };
  }
  for (const [i, l] of input.lines.entries()) {
    if (!l.item_id) return { ok: false, error: `Line ${i + 1}: item is required` };
    if (l.qty <= 0) return { ok: false, error: `Line ${i + 1}: qty must be > 0` };
  }

  // Approval check: transfer > 5000 EGP requires warehouse_manager (per seeded matrix).
  // We compute a rough estimate using avg_cost_egp from items table to gate before
  // calling the RPC; the RPC itself uses the actual stock cost which may differ.
  const sb = supabaseAdmin();
  const { data: items } = await sb
    .from('beithady_inventory_items')
    .select('id, avg_cost_egp')
    .in('id', input.lines.map(l => l.item_id));
  const costMap = new Map((items as Array<{ id: string; avg_cost_egp: number }> | null)?.map(it => [it.id, Number(it.avg_cost_egp)]) || []);
  const estimatedTotal = input.lines.reduce((s, l) => s + (l.qty * (costMap.get(l.item_id) || 0)), 0);

  const { data: approvers } = await sb.rpc('beithady_inv_required_approvers', {
    p_doc_type: 'transfer',
    p_sub_total_egp: estimatedTotal,
  });
  const required = (approvers as string[] | null) || [];
  if (required.length > 0 && !required.some(r => roles.includes(r as typeof roles[number]))) {
    return {
      ok: false,
      error: `Transfer of ~${estimatedTotal.toFixed(0)} EGP exceeds threshold. Requires one of: ${required.join(', ')}. Your roles: ${roles.join(', ')}`,
    };
  }

  // Call atomic RPC
  const { data: rpcResult, error } = await sb.rpc('beithady_inv_post_transfer', {
    p_src_warehouse_id: input.src_warehouse_id,
    p_dst_warehouse_id: input.dst_warehouse_id,
    p_lines: input.lines.map(l => ({
      item_id: l.item_id,
      qty: l.qty,
      batch_no_picked: l.batch_no_picked || '__bulk__',
    })),
    p_actor_user: user.id,
    p_notes: input.notes || null,
  });

  if (error) {
    return { ok: false, error: `Transfer failed: ${error.message}` };
  }

  const result = rpcResult as { transfer_id: string; total_value_egp: number; lines_posted: number };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'transfer.post',
    target_type: 'transfer',
    target_id: result.transfer_id,
    metadata: {
      src_warehouse_id: input.src_warehouse_id,
      dst_warehouse_id: input.dst_warehouse_id,
      lines: input.lines.length,
      total_value_egp: result.total_value_egp,
      notes: input.notes,
    },
  });

  revalidatePath('/beithady/inventory/transfers');
  revalidatePath('/beithady/inventory/stock');
  revalidatePath('/beithady/inventory');
  return { ok: true, transfer_id: result.transfer_id, total_value_egp: Number(result.total_value_egp), lines_posted: result.lines_posted };
}
