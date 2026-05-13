'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import {
  classifyParsedRows,
  commitClassifiedRows,
  type ParseResult,
} from '@/lib/beithady/financials/xlsx-import';
import type { PartnerKind } from '@/lib/beithady/financials/types';

export async function commitUpload(formData: FormData) {
  const uploadId = String(formData.get('upload_id'));
  const partnerKind = String(formData.get('partner_kind')) as PartnerKind;
  const sb = supabaseAdmin();

  const { data: up, error: upErr } = await sb
    .from('bh_balance_snapshot_uploads')
    .select('*')
    .eq('id', uploadId)
    .maybeSingle();
  if (upErr || !up) throw new Error(`commitUpload load: ${upErr?.message ?? 'not found'}`);

  const { data: snap } = await sb
    .from('bh_balance_snapshots')
    .select('id')
    .eq('period_end', up.period_end)
    .eq('company_scope', up.company_scope)
    .eq('status', 'frozen')
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!snap) throw new Error('commitUpload: no frozen snapshot for this period+scope');

  const { data: acct } = await sb
    .from('bh_balance_snapshot_accounts')
    .select('opening_raw')
    .eq('snapshot_id', snap.id)
    .eq('account_code', up.account_code)
    .maybeSingle();

  let q = sb.from('odoo_partners').select('id, name');
  if (partnerKind === 'supplier') q = q.gt('supplier_rank', 0);
  else if (partnerKind === 'owner') q = q.eq('is_owner', true);
  else if (partnerKind === 'employee') q = q.eq('is_employee', true);
  const { data: partners } = await q;

  const parsed: ParseResult = {
    rows:
      (up.raw_rows as Array<{
        source_row: number;
        partner_name_raw: string;
        balance: number;
      }>) ?? [],
    errors: (up.parse_errors as Array<{ row: number; error: string }>) ?? [],
    total: 0,
  };
  parsed.total =
    Math.round(parsed.rows.reduce((s, r) => s + r.balance, 0) * 100) / 100;

  const classified = classifyParsedRows(parsed, {
    account_code: up.account_code as string,
    partner_kind: partnerKind,
    odoo_partners: (partners ?? []) as Array<{ id: number; name: string }>,
    account_opening_raw: acct ? Number(acct.opening_raw) : undefined,
  });

  await commitClassifiedRows({ snapshot_id: snap.id, classified });

  await sb
    .from('bh_balance_snapshot_uploads')
    .update({
      snapshot_id: snap.id,
      parse_status: 'committed',
      classified_rows: classified.rows,
      parsed_partner_count: classified.rows.length,
    })
    .eq('id', uploadId);

  revalidatePath('/beithady/financials/import');
  revalidatePath('/beithady/financials/reconciliation');
  revalidatePath('/beithady/financials/ledgers');
  redirect('/beithady/financials/reconciliation');
}
