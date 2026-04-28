'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { recordAudit } from '@/lib/beithady/audit';
import { nextGrnNo, type GrnLine } from '@/lib/beithady/inventory/grn';

export type GrnLineInput = {
  item_id: string;
  qty_received: number;
  qty_rejected?: number;
  unit_cost_egp: number;
  batch_no?: string;
  expiry_date?: string | null;
  qc_photo_url?: string | null;
  note?: string | null;
};

export type CreateGrnInput = {
  vendor_id: string;
  warehouse_id: string;
  po_id?: string | null;
  received_at?: string;
  notes?: string | null;
  lines: GrnLineInput[];
};

export type GrnActionResult =
  | { ok: true; grn_id: string; grn_no?: string; status?: string }
  | { ok: false; error: string };

export async function createGrnDraftAction(input: CreateGrnInput): Promise<GrnActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  if (!input.vendor_id) return { ok: false, error: 'Vendor is required' };
  if (!input.warehouse_id) return { ok: false, error: 'Warehouse is required' };
  if (!input.lines || input.lines.length === 0) return { ok: false, error: 'At least one line is required' };

  for (const [i, l] of input.lines.entries()) {
    if (!l.item_id) return { ok: false, error: `Line ${i + 1}: item is required` };
    if (l.qty_received <= 0) return { ok: false, error: `Line ${i + 1}: quantity must be > 0` };
    if (l.unit_cost_egp < 0) return { ok: false, error: `Line ${i + 1}: cost cannot be negative` };
  }

  const sb = supabaseAdmin();
  const grn_no = await nextGrnNo();
  const sub_total = input.lines.reduce((s, l) => s + (l.qty_received * l.unit_cost_egp), 0);

  // Insert header
  const { data: header, error: headerErr } = await sb
    .from('beithady_inventory_grns')
    .insert({
      grn_no,
      status: 'draft',
      vendor_id: input.vendor_id,
      warehouse_id: input.warehouse_id,
      po_id: input.po_id || null,
      received_at: input.received_at || new Date().toISOString(),
      sub_total_egp: sub_total,
      notes: input.notes,
      created_by_user: user.id,
    })
    .select('*')
    .single();

  if (headerErr || !header) {
    return { ok: false, error: headerErr?.message || 'GRN insert failed' };
  }

  // Insert lines
  const linesToInsert = input.lines.map((l, i) => ({
    grn_id: header.id,
    line_no: i + 1,
    item_id: l.item_id,
    qty_received: l.qty_received,
    qty_rejected: l.qty_rejected || 0,
    unit_cost_egp: l.unit_cost_egp,
    batch_no: l.batch_no || '__bulk__',
    expiry_date: l.expiry_date || null,
    qc_photo_url: l.qc_photo_url || null,
    note: l.note || null,
  }));
  const { error: linesErr } = await sb
    .from('beithady_inventory_grn_lines')
    .insert(linesToInsert);

  if (linesErr) {
    // Rollback header to avoid orphan
    await sb.from('beithady_inventory_grns').delete().eq('id', header.id);
    return { ok: false, error: linesErr.message };
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'grn.create_draft',
    target_type: 'grn',
    target_id: header.id,
    after: header,
    metadata: { line_count: input.lines.length, sub_total_egp: sub_total },
  });

  revalidatePath('/emails/beithady/inventory/grn');
  revalidatePath('/emails/beithady/inventory');
  return { ok: true, grn_id: header.id, grn_no, status: 'draft' };
}

export async function submitGrnAction(grnId: string): Promise<GrnActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();

  const { data: grn } = await sb.from('beithady_inventory_grns').select('*').eq('id', grnId).maybeSingle();
  if (!grn) return { ok: false, error: 'GRN not found' };
  if (grn.status !== 'draft' && grn.status !== 'rejected') {
    return { ok: false, error: `Cannot submit a ${grn.status} GRN` };
  }

  // Determine if approval is required
  const { data: approvers } = await sb.rpc('beithady_inv_required_approvers', {
    p_doc_type: 'grn',
    p_sub_total_egp: grn.sub_total_egp,
  });
  const needsApproval = ((approvers as string[] | null) || []).length > 0;
  const newStatus = needsApproval ? 'pending_approval' : 'approved';

  const { error } = await sb
    .from('beithady_inventory_grns')
    .update({ status: newStatus })
    .eq('id', grnId);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: needsApproval ? 'grn.submit_for_approval' : 'grn.auto_approve',
    target_type: 'grn',
    target_id: grnId,
    metadata: { sub_total_egp: grn.sub_total_egp, required_approvers: approvers },
  });

  revalidatePath('/emails/beithady/inventory/grn');
  revalidatePath(`/emails/beithady/inventory/grn/${grnId}`);
  return { ok: true, grn_id: grnId, status: newStatus };
}

export async function approveGrnAction(grnId: string): Promise<GrnActionResult> {
  const { user, roles } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();

  const { data: grn } = await sb.from('beithady_inventory_grns').select('*').eq('id', grnId).maybeSingle();
  if (!grn) return { ok: false, error: 'GRN not found' };
  if (grn.status !== 'pending_approval') {
    return { ok: false, error: `Cannot approve a ${grn.status} GRN` };
  }

  const { data: approvers } = await sb.rpc('beithady_inv_required_approvers', {
    p_doc_type: 'grn',
    p_sub_total_egp: grn.sub_total_egp,
  });
  const required = (approvers as string[] | null) || [];
  if (!required.some(r => roles.includes(r as typeof roles[number]))) {
    return { ok: false, error: `Approval requires one of: ${required.join(', ')}. Your roles: ${roles.join(', ')}` };
  }

  const { error } = await sb
    .from('beithady_inventory_grns')
    .update({ status: 'approved', approver_user: user.id, approved_at: new Date().toISOString() })
    .eq('id', grnId);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'grn.approve',
    target_type: 'grn',
    target_id: grnId,
    metadata: { approver_role_satisfied: required.find(r => roles.includes(r as typeof roles[number])) },
  });

  revalidatePath('/emails/beithady/inventory/grn');
  revalidatePath(`/emails/beithady/inventory/grn/${grnId}`);
  return { ok: true, grn_id: grnId, status: 'approved' };
}

export async function rejectGrnAction(grnId: string, reason: string): Promise<GrnActionResult> {
  if (!reason || reason.length < 5) return { ok: false, error: 'Rejection reason required (min 5 chars)' };
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();

  const { data: grn } = await sb.from('beithady_inventory_grns').select('*').eq('id', grnId).maybeSingle();
  if (!grn) return { ok: false, error: 'GRN not found' };
  if (!['pending_approval', 'submitted'].includes(grn.status)) {
    return { ok: false, error: `Cannot reject a ${grn.status} GRN` };
  }

  const { error } = await sb
    .from('beithady_inventory_grns')
    .update({ status: 'rejected', rejected_reason: reason })
    .eq('id', grnId);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'grn.reject',
    target_type: 'grn',
    target_id: grnId,
    metadata: { reason },
  });

  revalidatePath('/emails/beithady/inventory/grn');
  revalidatePath(`/emails/beithady/inventory/grn/${grnId}`);
  return { ok: true, grn_id: grnId, status: 'rejected' };
}

// THE LOAD-BEARING ACTION: posts the GRN via the atomic RPC.
export async function postGrnAction(grnId: string): Promise<GrnActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();

  const { data: grn } = await sb.from('beithady_inventory_grns').select('*').eq('id', grnId).maybeSingle();
  if (!grn) return { ok: false, error: 'GRN not found' };
  if (grn.status !== 'approved') {
    return { ok: false, error: `Cannot post a ${grn.status} GRN — must be approved first` };
  }

  // Call the atomic RPC (advisory locks + transactions + stock + avg_cost)
  const { data: rpcResult, error } = await sb.rpc('beithady_inv_post_grn', {
    p_grn_id: grnId,
    p_actor_user: user.id,
  });

  if (error) {
    return { ok: false, error: `Posting failed: ${error.message}` };
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'grn.post',
    target_type: 'grn',
    target_id: grnId,
    metadata: rpcResult as Record<string, unknown>,
  });

  revalidatePath('/emails/beithady/inventory/grn');
  revalidatePath(`/emails/beithady/inventory/grn/${grnId}`);
  revalidatePath('/emails/beithady/inventory/stock');
  revalidatePath('/emails/beithady/inventory');
  return { ok: true, grn_id: grnId, status: 'posted' };
}
