'use server';

import { revalidatePath } from 'next/cache';
import { createHash } from 'node:crypto';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { parsePartnerLedgerXlsx } from '@/lib/beithady/financials/xlsx-import';
import type { CompanyScope } from '@/lib/beithady/financials/types';

export async function uploadXlsx(formData: FormData) {
  const file = formData.get('file') as File | null;
  const accountCode = String(formData.get('account_code') || '');
  const periodEnd = String(formData.get('period_end') || '');
  const scope = String(formData.get('company_scope') || 'consolidated') as CompanyScope;

  if (!file || !accountCode || !periodEnd) {
    throw new Error('uploadXlsx: missing file / account_code / period_end');
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const sha = createHash('sha256').update(buf).digest('hex');
  const sb = supabaseAdmin();

  const { data: dup } = await sb
    .from('bh_balance_snapshot_uploads')
    .select('id')
    .eq('file_sha256', sha)
    .maybeSingle();
  if (dup) {
    throw new Error(`uploadXlsx: file already uploaded (id=${dup.id})`);
  }

  const parsed = await parsePartnerLedgerXlsx(buf);

  const { data: row, error } = await sb
    .from('bh_balance_snapshot_uploads')
    .insert({
      filename: file.name,
      file_sha256: sha,
      account_code: accountCode,
      period_end: periodEnd,
      company_scope: scope,
      parse_status: parsed.errors.length === 0 ? 'parsed' : 'failed',
      parse_errors: parsed.errors,
      raw_row_count: parsed.rows.length,
      raw_rows: parsed.rows,
    })
    .select('id')
    .single();
  if (error) throw new Error(`uploadXlsx insert: ${error.message}`);

  revalidatePath('/beithady/financials/import');
  redirect(`/beithady/financials/import/${row.id}`);
}
