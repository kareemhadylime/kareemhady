// src/lib/beithady/financials/snapshots.ts
import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
import type { BhBalanceSnapshot, CompanyScope } from './types';

export async function listSnapshots(params: { scope: CompanyScope }): Promise<BhBalanceSnapshot[]> {
  const sb = supabaseAdmin();
  const { data, error } = (await sb
    .from('bh_balance_snapshots')
    .select('*')
    .eq('company_scope', params.scope)
    .order('period_end', { ascending: false })) as { data: BhBalanceSnapshot[] | null; error: { message: string } | null };
  if (error) throw new Error(`listSnapshots: ${error.message}`);
  return data ?? [];
}

export async function getSnapshot(id: string): Promise<BhBalanceSnapshot | null> {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('bh_balance_snapshots')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getSnapshot: ${error.message}`);
  return (data as BhBalanceSnapshot | null) ?? null;
}

export async function freezeSnapshot(params: {
  snapshot_id: string;
  user_id: string;
}): Promise<BhBalanceSnapshot> {
  const sb = supabaseAdmin();

  // 1. Load draft.
  const { data: snap, error: snapErr } = await sb
    .from('bh_balance_snapshots')
    .select('*')
    .eq('id', params.snapshot_id)
    .maybeSingle();
  if (snapErr) throw new Error(`freezeSnapshot load: ${snapErr.message}`);
  if (!snap) throw new Error(`freezeSnapshot: snapshot ${params.snapshot_id} not found`);
  if ((snap as BhBalanceSnapshot).status !== 'draft') {
    throw new Error(`freezeSnapshot: snapshot is ${(snap as BhBalanceSnapshot).status}, not draft`);
  }

  // 2. Ensure draft has at least one account row.
  const { data: acctRows, error: acctErr } = await sb
    .from('bh_balance_snapshot_accounts')
    .select('id')
    .eq('snapshot_id', params.snapshot_id);
  if (acctErr) throw new Error(`freezeSnapshot account check: ${acctErr.message}`);
  if (!acctRows || acctRows.length === 0) {
    throw new Error('freezeSnapshot: draft has no account-level rows');
  }

  // 3. Transaction handled in DB via stored function `bh_freeze_snapshot`.
  const { data: rpcOut, error: rpcErr } = await sb.rpc('bh_freeze_snapshot', {
    p_snapshot_id: params.snapshot_id,
    p_user_id: params.user_id,
  });
  if (rpcErr) throw new Error(`freezeSnapshot rpc: ${rpcErr.message}`);
  return rpcOut as BhBalanceSnapshot;
}

export async function cloneForRefreeze(params: {
  source_snapshot_id: string;
  user_id: string;
}): Promise<{ new_snapshot_id: string; new_version: number }> {
  const sb = supabaseAdmin();
  const { data, error } = await sb.rpc('bh_clone_snapshot_for_refreeze', {
    p_source_snapshot_id: params.source_snapshot_id,
    p_user_id: params.user_id,
  });
  if (error) throw new Error(`cloneForRefreeze: ${error.message}`);
  return data as { new_snapshot_id: string; new_version: number };
}
