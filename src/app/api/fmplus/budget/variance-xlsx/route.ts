// @ts-nocheck — v1 orphan; replaced in Tasks 13-39 of fmplus-budget-v2 plan
import { NextResponse } from 'next/server';
import { getCurrentUser, canAccessDomain } from '@/lib/auth';
import { buildBudgetVariance } from '@/lib/fmplus/budget/variance';
import { buildVarianceXlsx } from '@/lib/fmplus/budget/exports/variance-xlsx';
import { ScenarioSchema } from '@/lib/fmplus/budget/schema';

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user || !canAccessDomain(user, 'fmplus')) {
    return new NextResponse('Forbidden', { status: 403 });
  }
  const url = new URL(req.url);
  const projectId = Number(url.searchParams.get('project') ?? 0);
  const year = Number(url.searchParams.get('year') ?? new Date().getUTCFullYear());
  const scenario = ScenarioSchema.safeParse(url.searchParams.get('scenario') ?? 'initial');
  const through = Number(url.searchParams.get('through') ?? new Date().getUTCMonth() + 1);
  if (!projectId || !scenario.success) {
    return new NextResponse('Bad request', { status: 400 });
  }
  const report = await buildBudgetVariance({
    projectId, fiscalYear: year, scenario: scenario.data, ytdThrough: through,
  });
  if (!report) return new NextResponse('Not found', { status: 404 });
  const buf = await buildVarianceXlsx(report);
  const fname = `variance-${report.project_name}-${year}-${scenario.data}.xlsx`.replace(/[^a-zA-Z0-9._-]/g, '_');
  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fname}"`,
    },
  });
}
