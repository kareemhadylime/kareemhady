'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { recordAudit } from '@/lib/beithady/audit';
import { nextIssueNo, type IssueType, type IssueCreatedVia } from '@/lib/beithady/inventory/issue';
import { resolveUnitCostEgp } from '@/lib/beithady/inventory/unit-cost';

export type IssueLineInput = {
  item_id: string;
  qty: number;
  batch_no_picked?: string;
  note?: string | null;
};

export type CreateIssueInput = {
  type: IssueType;
  warehouse_id: string;
  ref_reservation_id?: string | null;
  ref_task_id?: string | null;
  ref_owner?: string | null;
  ref_kit_id?: string | null;
  notes?: string | null;
  photo_url?: string | null;
  cleaner_session_name?: string | null;
  created_via?: IssueCreatedVia;
  lines: IssueLineInput[];
};

export type IssueActionResult =
  | { ok: true; issue_id: string; issue_no?: string; status?: string }
  | { ok: false; error: string };

export async function createIssueDraftAction(input: CreateIssueInput): Promise<IssueActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  if (!input.warehouse_id) return { ok: false, error: 'Warehouse is required' };
  if (!input.lines || input.lines.length === 0) return { ok: false, error: 'At least one line is required' };
  for (const [i, l] of input.lines.entries()) {
    if (!l.item_id) return { ok: false, error: `Line ${i + 1}: item is required` };
    if (l.qty <= 0) return { ok: false, error: `Line ${i + 1}: quantity must be > 0` };
  }

  const sb = supabaseAdmin();
  const issue_no = await nextIssueNo();

  const { data: header, error: headerErr } = await sb
    .from('beithady_inventory_issues')
    .insert({
      issue_no,
      status: 'draft',
      type: input.type,
      warehouse_id: input.warehouse_id,
      ref_reservation_id: input.ref_reservation_id || null,
      ref_task_id: input.ref_task_id || null,
      ref_owner: input.ref_owner || null,
      ref_kit_id: input.ref_kit_id || null,
      notes: input.notes,
      photo_url: input.photo_url,
      cleaner_session_name: input.cleaner_session_name,
      created_via: input.created_via || 'manual',
      created_by_user: user.id,
    })
    .select('*')
    .single();

  if (headerErr || !header) {
    return { ok: false, error: headerErr?.message || 'Issue insert failed' };
  }

  const linesToInsert = input.lines.map((l, i) => ({
    issue_id: header.id,
    line_no: i + 1,
    item_id: l.item_id,
    qty: l.qty,
    batch_no_picked: l.batch_no_picked || '__bulk__',
    note: l.note || null,
  }));
  const { error: linesErr } = await sb
    .from('beithady_inventory_issue_lines')
    .insert(linesToInsert);

  if (linesErr) {
    await sb.from('beithady_inventory_issues').delete().eq('id', header.id);
    return { ok: false, error: linesErr.message };
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'issue.create_draft',
    target_type: 'issue',
    target_id: header.id,
    after: header,
    metadata: { type: input.type, line_count: input.lines.length },
  });

  revalidatePath('/beithady/inventory/issue');
  revalidatePath('/beithady/inventory');
  return { ok: true, issue_id: header.id, issue_no, status: 'draft' };
}

async function transitionIssue(
  issueId: string,
  newStatus: string,
  action: string,
  metadata?: Record<string, unknown>,
): Promise<IssueActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();
  const updates: Record<string, unknown> = { status: newStatus };
  if (newStatus === 'approved') {
    updates.approver_user = user.id;
    updates.approved_at = new Date().toISOString();
  }
  const { error } = await sb.from('beithady_inventory_issues').update(updates).eq('id', issueId);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action,
    target_type: 'issue',
    target_id: issueId,
    metadata,
  });

  revalidatePath('/beithady/inventory/issue');
  revalidatePath(`/beithady/inventory/issue/${issueId}`);
  return { ok: true, issue_id: issueId, status: newStatus };
}

export async function submitIssueAction(issueId: string): Promise<IssueActionResult> {
  const sb = supabaseAdmin();
  const { data: issue } = await sb.from('beithady_inventory_issues').select('*').eq('id', issueId).maybeSingle();
  if (!issue) return { ok: false, error: 'Issue not found' };
  if (!['draft', 'rejected'].includes(issue.status)) {
    return { ok: false, error: `Cannot submit a ${issue.status} issue` };
  }

  // Audit fix C3: previously passed p_sub_total_egp=0 always, so the
  // seeded `('issue','sub_total_egp','>','1000','warehouse_manager')`
  // approval rule never fired and a 50,000 EGP issue auto-approved on
  // the cost dimension. Real cost is only known after FIFO at posting,
  // but we estimate here using items.avg_cost_egp × qty (same trick
  // postTransferAction uses). Estimate is conservative for routing —
  // post-time sub_total updates the actual figure.
  const { data: lines } = await sb
    .from('beithady_inventory_issue_lines')
    .select('qty, item_id')
    .eq('issue_id', issueId);
  let estimatedSubTotal = 0;
  const lineRows = (lines as Array<{ qty: number; item_id: string }> | null) || [];
  if (lineRows.length > 0) {
    const itemIds = Array.from(new Set(lineRows.map(l => l.item_id)));
    const { data: itemCosts } = await sb
      .from('beithady_inventory_items')
      .select('id, avg_cost_egp, last_cost_egp, default_cost_egp, amazon_eg_price_egp, amazon_eg_pack_size')
      .in('id', itemIds);
    const costById = new Map<string, number>();
    for (const r of (itemCosts as Array<Parameters<typeof resolveUnitCostEgp>[0] & { id: string }> | null) || []) {
      costById.set(r.id, resolveUnitCostEgp(r).unitCostEgp);
    }
    for (const l of lineRows) {
      estimatedSubTotal += Number(l.qty || 0) * (costById.get(l.item_id) || 0);
    }
  }

  const { data: approvers } = await sb.rpc('beithady_inv_required_approvers', {
    p_doc_type: 'issue',
    p_sub_total_egp: estimatedSubTotal,
    p_type_value: issue.type,
  });
  const needsApproval = ((approvers as string[] | null) || []).length > 0;
  return transitionIssue(
    issueId,
    needsApproval ? 'pending_approval' : 'approved',
    needsApproval ? 'issue.submit_for_approval' : 'issue.auto_approve',
    { type: issue.type, estimated_sub_total_egp: estimatedSubTotal, required_approvers: approvers },
  );
}

export async function approveIssueAction(issueId: string): Promise<IssueActionResult> {
  const { roles } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();
  const { data: issue } = await sb.from('beithady_inventory_issues').select('*').eq('id', issueId).maybeSingle();
  if (!issue) return { ok: false, error: 'Issue not found' };
  if (issue.status !== 'pending_approval') {
    return { ok: false, error: `Cannot approve a ${issue.status} issue` };
  }

  const { data: approvers } = await sb.rpc('beithady_inv_required_approvers', {
    p_doc_type: 'issue',
    p_sub_total_egp: issue.sub_total_egp,
    p_type_value: issue.type,
  });
  const required = (approvers as string[] | null) || [];
  if (!required.some(r => roles.includes(r as typeof roles[number]))) {
    return { ok: false, error: `Approval requires one of: ${required.join(', ')}` };
  }

  return transitionIssue(issueId, 'approved', 'issue.approve');
}

export async function rejectIssueAction(issueId: string, reason: string): Promise<IssueActionResult> {
  if (!reason || reason.length < 5) return { ok: false, error: 'Rejection reason required (min 5 chars)' };
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('beithady_inventory_issues')
    .update({ status: 'rejected', rejected_reason: reason })
    .eq('id', issueId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'issue.reject',
    target_type: 'issue',
    target_id: issueId,
    metadata: { reason },
  });
  revalidatePath('/beithady/inventory/issue');
  revalidatePath(`/beithady/inventory/issue/${issueId}`);
  return { ok: true, issue_id: issueId, status: 'rejected' };
}

export async function postIssueAction(issueId: string): Promise<IssueActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();
  const { data: issue } = await sb.from('beithady_inventory_issues').select('*').eq('id', issueId).maybeSingle();
  if (!issue) return { ok: false, error: 'Issue not found' };
  if (issue.status !== 'approved') {
    return { ok: false, error: `Cannot post a ${issue.status} issue — must be approved first` };
  }

  const { data: rpcResult, error } = await sb.rpc('beithady_inv_post_issue', {
    p_issue_id: issueId,
    p_actor_user: user.id,
  });
  if (error) return { ok: false, error: `Posting failed: ${error.message}` };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'issue.post',
    target_type: 'issue',
    target_id: issueId,
    metadata: rpcResult as Record<string, unknown>,
  });

  revalidatePath('/beithady/inventory/issue');
  revalidatePath(`/beithady/inventory/issue/${issueId}`);
  revalidatePath('/beithady/inventory/stock');
  revalidatePath('/beithady/inventory');
  return { ok: true, issue_id: issueId, status: 'posted' };
}
