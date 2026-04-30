// GET /api/beithady/reports/[id]/pdf — stream A4 PDF.
// Re-runs the report fresh (uses last saved config). Returns PDF buffer.

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasBeithadyPermission } from '@/lib/beithady/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { buildReport } from '@/lib/beithady/reports/build-report';
import { generateCommentary } from '@/lib/beithady/reports/ai-commentary';
import { renderReportPdf } from '@/lib/beithady/reports/render-pdf';
import type { ReportConfig, ReportData } from '@/lib/beithady/reports/types';

export const runtime = 'nodejs';
export const maxDuration = 90;

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
    .select('config, last_run_data, commentary, title')
    .eq('id', id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: 'not found' }, { status: 404 });

  let data: ReportData;
  if (useCache && row.last_run_data) {
    data = row.last_run_data as ReportData;
  } else {
    data = await buildReport(row.config as ReportConfig);
    if (data.config.enableAiCommentary !== false) {
      const c = await generateCommentary(data);
      if (c) data.commentary = c;
    }
  }

  const pdf = await renderReportPdf(data);

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${(row.title || 'report').replace(/[^a-z0-9]+/gi, '-')}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
