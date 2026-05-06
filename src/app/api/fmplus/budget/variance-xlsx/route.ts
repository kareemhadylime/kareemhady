import { NextResponse } from 'next/server';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { buildBudgetVarianceV2 } from '@/lib/fmplus/budget/variance';
import { exportVarianceXlsx } from '@/lib/fmplus/budget/exports/variance-xlsx';
import type { ServiceLine } from '@/lib/fmplus/budget/types';

const SERVICE_VALUES: ServiceLine[] = ['hk','mep','landscape','security','pest_ctrl','waste_mgmt','back_office'];

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  await requireBudgetView();
  const url = new URL(req.url);
  const contractId = Number(url.searchParams.get('contract'));
  const yearIndex = Number(url.searchParams.get('year')) || 1;
  const scenario = (url.searchParams.get('scenario') ?? 'initial') as 'initial' | 'revised' | 'reforecast';
  const service = url.searchParams.get('service');

  if (!Number.isFinite(contractId) || contractId <= 0) {
    return NextResponse.json({ error: 'invalid contract' }, { status: 400 });
  }

  const report = await buildBudgetVarianceV2({
    contractId, yearIndex, scenario,
    serviceLine: SERVICE_VALUES.includes(service as ServiceLine) ? (service as ServiceLine) : undefined,
  });
  const buf = await exportVarianceXlsx(report);
  const filename = `variance-${report.contract_name.replace(/[^a-z0-9]/gi, '_')}-Y${report.year_index}.xlsx`;

  return new NextResponse(buf as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
