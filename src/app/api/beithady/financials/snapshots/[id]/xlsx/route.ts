// GET /api/beithady/financials/snapshots/[id]/xlsx — formatted snapshot export.

import { NextResponse } from 'next/server';
import { requireDomainAccess } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getSnapshot } from '@/lib/beithady/financials/snapshots';
import { renderSnapshotXlsx } from '@/lib/beithady/financials/render-xlsx';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  await requireDomainAccess('beithady');

  const { id } = await ctx.params;
  const snap = await getSnapshot(id);
  if (!snap) {
    return NextResponse.json({ error: 'snapshot_not_found' }, { status: 404 });
  }

  const sb = supabaseAdmin();
  const [{ data: accounts }, { data: partners }] = await Promise.all([
    sb
      .from('bh_balance_snapshot_accounts')
      .select('account_code, account_name, opening_raw, partner_total, variance')
      .eq('snapshot_id', id)
      .order('account_code'),
    sb
      .from('bh_balance_snapshot_partners')
      .select('account_code, partner_kind, partner_name_raw, opening_balance, is_synthetic')
      .eq('snapshot_id', id)
      .order('account_code'),
  ]);

  const xlsx = await renderSnapshotXlsx(snap, accounts ?? [], partners ?? []);

  const fname = `beithady-snapshot-${snap.period_end}-v${snap.version}-${snap.company_scope}.xlsx`;
  return new NextResponse(new Uint8Array(xlsx), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fname}"`,
      'Cache-Control': 'no-store',
    },
  });
}
