'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { recordAudit } from '@/lib/beithady/audit';
import { nextCountSessionNo, type CountSessionType } from '@/lib/beithady/inventory/counts';

export type CreateCountSessionInput = {
  type: CountSessionType;
  warehouse_id: string;
  scheduled_for?: string | null;
  notes?: string | null;
  // For 'cycle': how many random items to pick. For 'physical': ignored (all items used)
  cycle_sample_size?: number;
};

export type CountActionResult =
  | { ok: true; session_id: string; session_no: string; line_count: number }
  | { ok: false; error: string };

export async function createCountSessionAction(input: CreateCountSessionInput): Promise<CountActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  if (!input.warehouse_id) return { ok: false, error: 'Warehouse is required' };

  const sb = supabaseAdmin();

  // Find items to count: every item with a stock row in this warehouse
  // (positive OR zero — zero rows are useful too, e.g. confirming stockout).
  const { data: stockRows } = await sb
    .from('beithady_inventory_stock')
    .select('item_id, batch_no, qty_on_hand')
    .eq('warehouse_id', input.warehouse_id);

  let lineSeed = (stockRows as Array<{ item_id: string; batch_no: string; qty_on_hand: number }> | null) || [];

  if (input.type === 'cycle') {
    const sampleSize = Math.max(5, Math.min(input.cycle_sample_size || 10, 50));
    // Random sample (Fisher-Yates partial)
    const shuffled = [...lineSeed];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    lineSeed = shuffled.slice(0, sampleSize);
  }

  if (lineSeed.length === 0) {
    return { ok: false, error: 'No stock rows in this warehouse to count. Receive some items first via GRN.' };
  }

  const session_no = await nextCountSessionNo();
  const { data: header, error: hErr } = await sb
    .from('beithady_inventory_count_sessions')
    .insert({
      session_no,
      type: input.type,
      warehouse_id: input.warehouse_id,
      scheduled_for: input.scheduled_for || null,
      status: 'open',
      notes: input.notes,
      created_by_user: user.id,
    })
    .select('*')
    .single();
  if (hErr || !header) return { ok: false, error: hErr?.message || 'Header insert failed' };

  const linesToInsert = lineSeed.map(s => ({
    session_id: header.id,
    item_id: s.item_id,
    batch_no: s.batch_no,
    expected_qty: Number(s.qty_on_hand),
    counted_qty: null,
  }));
  const { error: lErr } = await sb.from('beithady_inventory_count_lines').insert(linesToInsert);
  if (lErr) {
    await sb.from('beithady_inventory_count_sessions').delete().eq('id', header.id);
    return { ok: false, error: lErr.message };
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'count.create_session',
    target_type: 'count_session',
    target_id: header.id,
    after: header,
    metadata: { type: input.type, line_count: lineSeed.length, warehouse_id: input.warehouse_id },
  });

  revalidatePath('/beithady/inventory/counts');
  return { ok: true, session_id: header.id, session_no, line_count: lineSeed.length };
}

export type SaveCountedQtyInput = {
  session_id: string;
  cleaner_session_name?: string | null;
  lines: Array<{ line_id: string; counted_qty: number | null; note?: string | null }>;
};

export async function saveCountedQtyAction(input: SaveCountedQtyInput): Promise<{ ok: true; updated: number } | { ok: false; error: string }> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();

  const { data: session } = await sb.from('beithady_inventory_count_sessions').select('*').eq('id', input.session_id).maybeSingle();
  if (!session) return { ok: false, error: 'Session not found' };
  if (!['open', 'in_progress'].includes(session.status)) {
    return { ok: false, error: `Cannot edit a ${session.status} count session` };
  }

  let updated = 0;
  for (const l of input.lines) {
    const { error } = await sb
      .from('beithady_inventory_count_lines')
      .update({ counted_qty: l.counted_qty, note: l.note })
      .eq('id', l.line_id)
      .eq('session_id', input.session_id);
    if (!error) updated++;
  }

  // Move session to in_progress + record cleaner session name
  const { error: sErr } = await sb
    .from('beithady_inventory_count_sessions')
    .update({
      status: 'in_progress',
      cleaner_session_name: input.cleaner_session_name || session.cleaner_session_name,
    })
    .eq('id', input.session_id);
  if (sErr) return { ok: false, error: sErr.message };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'count.save_counts',
    target_type: 'count_session',
    target_id: input.session_id,
    metadata: { lines_updated: updated, cleaner_session_name: input.cleaner_session_name },
  });

  revalidatePath('/beithady/inventory/counts');
  revalidatePath(`/beithady/inventory/counts/${input.session_id}`);
  return { ok: true, updated };
}

export async function submitCountForApprovalAction(sessionId: string): Promise<CountActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();

  // Compute variance % to drive approval routing
  const { data: lines } = await sb
    .from('beithady_inventory_count_lines')
    .select('expected_qty, counted_qty, variance_qty')
    .eq('session_id', sessionId)
    .not('counted_qty', 'is', null);

  const totals = (lines as Array<{ expected_qty: number; counted_qty: number; variance_qty: number | null }> | null) || [];
  const totalExpected = totals.reduce((s, l) => s + Number(l.expected_qty || 0), 0);
  const totalAbsVariance = totals.reduce((s, l) => s + Math.abs(Number(l.variance_qty || 0)), 0);
  const variancePct = totalExpected > 0 ? (totalAbsVariance / totalExpected) * 100 : 0;

  const { data: approvers } = await sb.rpc('beithady_inv_required_approvers', {
    p_doc_type: 'count',
    p_variance_pct: variancePct,
  });
  const required = (approvers as string[] | null) || [];
  const newStatus = required.length > 0 ? 'pending_approval' : 'approved' as 'approved';

  const { error } = await sb
    .from('beithady_inventory_count_sessions')
    .update({ status: newStatus })
    .eq('id', sessionId);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: required.length > 0 ? 'count.submit_for_approval' : 'count.auto_approve',
    target_type: 'count_session',
    target_id: sessionId,
    metadata: { variance_pct: variancePct, required_approvers: required, lines_counted: totals.length },
  });

  revalidatePath('/beithady/inventory/counts');
  revalidatePath(`/beithady/inventory/counts/${sessionId}`);
  return { ok: true, session_id: sessionId, session_no: '', line_count: totals.length };
}

export async function approveCountAction(sessionId: string): Promise<CountActionResult> {
  const { user, roles } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();
  const { data: session } = await sb.from('beithady_inventory_count_sessions').select('*').eq('id', sessionId).maybeSingle();
  if (!session) return { ok: false, error: 'Session not found' };
  if (session.status !== 'pending_approval') return { ok: false, error: `Cannot approve a ${session.status} session` };

  const { data: approvers } = await sb.rpc('beithady_inv_required_approvers', {
    p_doc_type: 'count',
    p_variance_pct: 100, // worst case
  });
  const required = (approvers as string[] | null) || ['warehouse_manager'];
  if (!required.some(r => roles.includes(r as typeof roles[number]))) {
    return { ok: false, error: `Approval requires one of: ${required.join(', ')}` };
  }

  const { error } = await sb
    .from('beithady_inventory_count_sessions')
    .update({
      // Bug fix C2: previously only stamped approver_user/approved_at and
      // left status as 'pending_approval'. The post RPC also accepted
      // 'in_progress', so a count could be posted without ever going
      // through approveCountAction. Now we move status to 'approved' so
      // the RPC's tightened guard (only 'approved') matches.
      status: 'approved',
      approver_user: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq('id', sessionId);
  if (error) return { ok: false, error: error.message };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'count.approve',
    target_type: 'count_session',
    target_id: sessionId,
  });
  revalidatePath('/beithady/inventory/counts');
  revalidatePath(`/beithady/inventory/counts/${sessionId}`);
  return { ok: true, session_id: sessionId, session_no: '', line_count: 0 };
}

export async function postCountAction(sessionId: string): Promise<CountActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();

  // Bug fix C2: pre-flight status check. Previously the RPC accepted both
  // 'approved' and 'in_progress', so calling postCountAction on an
  // in_progress session bypassed approveCountAction (and its variance-pct
  // → warehouse_manager rule). The RPC is now tightened to 'approved'
  // only, but the TS check gives a clearer error message and avoids the
  // round-trip.
  const { data: session } = await sb
    .from('beithady_inventory_count_sessions')
    .select('status')
    .eq('id', sessionId)
    .maybeSingle();
  if (!session) return { ok: false, error: 'Session not found' };
  if (session.status !== 'approved') {
    return { ok: false, error: `Cannot post a ${session.status} count session — must be approved first` };
  }

  const { data: rpcResult, error } = await sb.rpc('beithady_inv_post_count_session', {
    p_session_id: sessionId,
    p_actor_user: user.id,
  });
  if (error) return { ok: false, error: `Posting failed: ${error.message}` };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'count.post',
    target_type: 'count_session',
    target_id: sessionId,
    metadata: rpcResult as Record<string, unknown>,
  });

  revalidatePath('/beithady/inventory/counts');
  revalidatePath(`/beithady/inventory/counts/${sessionId}`);
  revalidatePath('/beithady/inventory/stock');
  revalidatePath('/beithady/inventory');
  const r = rpcResult as { lines_adjusted: number };
  return { ok: true, session_id: sessionId, session_no: '', line_count: r.lines_adjusted };
}

export async function cancelCountAction(sessionId: string, reason: string): Promise<CountActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('beithady_inventory_count_sessions')
    .update({ status: 'cancelled', notes: reason })
    .eq('id', sessionId);
  if (error) return { ok: false, error: error.message };
  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'count.cancel',
    target_type: 'count_session',
    target_id: sessionId,
    metadata: { reason },
  });
  revalidatePath('/beithady/inventory/counts');
  return { ok: true, session_id: sessionId, session_no: '', line_count: 0 };
}
