// GET /api/beithady/reports/[id]/xlsx — stream XLSX export.

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { buildReport } from '@/lib/beithady/reports/build-report';
import { renderReportXlsx } from '@/lib/beithady/reports/render-xlsx';
import type { ReportConfig, ReportData } from '@/lib/beithady/reports/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(await hasBeithadyPermission(user, 'analytics', 'read'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const useCache = url.searchParams.get('cached') === '1';

  const sb = supabaseAdmin();
  const { data: row, error } = await sb
    .from('beithady_saved_reports')
    .select('config, last_run_data, title')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[reports/[id]/xlsx] db error:', error);
    return NextResponse.json({ error: 'database_error' }, { status: 500 });
  }
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let data: ReportData;
  if (useCache && row.last_run_data) {
    data = row.last_run_data as ReportData;
  } else {
    data = await buildReport(row.config as ReportConfig);
  }

  const xlsx = await renderReportXlsx(data);

  return new NextResponse(new Uint8Array(xlsx), {
    headers: {
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${(row.title || 'report').replace(/[^a-z0-9]+/gi, '-')}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
