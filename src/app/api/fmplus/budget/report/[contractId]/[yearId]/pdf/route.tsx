import { NextResponse, type NextRequest } from 'next/server';
import { renderToBuffer } from '@react-pdf/renderer';
import React from 'react';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { buildProjectReport } from '@/lib/fmplus/budget/report/build-report';
import { ProjectReportDocument } from '@/lib/fmplus/budget/report/pdf-document';
import { supabaseAdmin } from '@/lib/supabase';
import type { ReportMode, ReportLang } from '@/lib/fmplus/budget/report/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VALID_MODES: ReportMode[] = ['pre', 'signoff', 'customer', 'snapshot'];
const VALID_LANGS: ReportLang[] = ['en', 'ar', 'both'];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ contractId: string; yearId: string }> },
) {
  const user = await requireBudgetView();

  const { contractId: cIdStr, yearId: yIdStr } = await params;
  const contract_id = Number(cIdStr);
  const year_id = Number(yIdStr);
  if (!Number.isFinite(contract_id) || contract_id <= 0) {
    return NextResponse.json({ error: 'invalid contract id' }, { status: 400 });
  }
  if (!Number.isFinite(year_id) || year_id <= 0) {
    return NextResponse.json({ error: 'invalid year id' }, { status: 400 });
  }

  const url = new URL(req.url);
  const modeParam = (url.searchParams.get('mode') ?? 'signoff') as string;
  const langParam = (url.searchParams.get('lang') ?? 'en') as string;
  const mode = (VALID_MODES as string[]).includes(modeParam) ? (modeParam as ReportMode) : 'signoff';
  const lang = (VALID_LANGS as string[]).includes(langParam) ? (langParam as ReportLang) : 'en';

  let data;
  try {
    data = await buildProjectReport({
      contract_id, year_id, mode, lang,
      generated_by: user.username ?? 'system',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed to build report';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Customer-facing mode requires a published year (cost-leak safety).
  if (mode === 'customer' && data.meta.year.status === 'draft') {
    return NextResponse.json(
      { error: 'Customer-facing report requires year status = published. Publish the budget in Editor first.' },
      { status: 403 },
    );
  }

  let buffer: Buffer;
  try {
    buffer = await renderToBuffer(<ProjectReportDocument data={data} />);
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'failed to render PDF';
    console.error('[report/pdf] render error:', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Audit row — best-effort, do not block download if it fails
  try {
    const sb = supabaseAdmin();
    await sb.from('budget_report_exports').insert({
      year_id,
      contract_id,
      mode,
      lang,
      exported_by: user.id,
      user_agent: req.headers.get('user-agent'),
    });
  } catch (e) {
    console.error('[report/pdf] audit-log insert failed (non-fatal):', e);
  }

  const slug = data.meta.contract.name.replace(/[^A-Za-z0-9]+/g, '_');
  const filename = `${slug}_${data.meta.year.scenario}_Y${data.meta.year.year_index}_${mode}_${lang}.pdf`;

  return new NextResponse(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
