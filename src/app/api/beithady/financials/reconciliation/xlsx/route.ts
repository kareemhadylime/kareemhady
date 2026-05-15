// GET /api/beithady/financials/reconciliation/xlsx?snapshot=<id>
// — formatted reconciliation export for a given snapshot (defaults to the
//   latest frozen consolidated snapshot when no id is provided).

import { NextResponse } from 'next/server';
import { requireDomainAccess } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { getSnapshot } from '@/lib/beithady/financials/snapshots';
import { buildReconciliation } from '@/lib/beithady/financials/reconciliation';
import { renderReconciliationXlsx } from '@/lib/beithady/financials/render-xlsx';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  await requireDomainAccess('beithady');

  const url = new URL(req.url);
  let snapshotId = url.searchParams.get('snapshot');

  if (!snapshotId) {
    const sb = supabaseAdmin();
    const { data } = await sb
      .from('bh_balance_snapshots')
      .select('id')
      .eq('company_scope', 'consolidated')
      .eq('status', 'frozen')
      .order('period_end', { ascending: false })
      .limit(1)
      .maybeSingle();
    snapshotId = data?.id ?? null;
  }

  if (!snapshotId) {
    return NextResponse.json({ error: 'no_frozen_snapshot' }, { status: 404 });
  }

  const snap = await getSnapshot(snapshotId);
  if (!snap) {
    return NextResponse.json({ error: 'snapshot_not_found' }, { status: 404 });
  }

  const report = await buildReconciliation({ snapshot_id: snapshotId });
  const xlsx = await renderReconciliationXlsx(snap, report);

  const fname = `beithady-reconciliation-${snap.period_end}-v${snap.version}-${snap.company_scope}.xlsx`;
  return new NextResponse(new Uint8Array(xlsx), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fname}"`,
      'Cache-Control': 'no-store',
    },
  });
}
