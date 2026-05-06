import { NextResponse } from 'next/server';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { cellToMoveLines } from '@/lib/fmplus/budget/variance-drill';
import type { ServiceLine, Category } from '@/lib/fmplus/budget/types';

const SERVICE_VALUES: ServiceLine[] = ['hk','mep','landscape','security','pest_ctrl','waste_mgmt','back_office'];
const CATEGORY_VALUES: Category[] = ['manning','ppe','tools','consumables','transport','it','governmental','other'];

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  await requireBudgetView();
  const url = new URL(req.url);
  const contractId = Number(url.searchParams.get('contract'));
  const yearIndex = Number(url.searchParams.get('year'));
  const scenario = url.searchParams.get('scenario') ?? 'initial';
  const service = url.searchParams.get('service');
  const category = url.searchParams.get('category');
  const month = Number(url.searchParams.get('month'));

  if (!Number.isFinite(contractId) || !Number.isFinite(yearIndex) || !Number.isFinite(month)) {
    return NextResponse.json({ error: 'invalid params' }, { status: 400 });
  }
  if (!SERVICE_VALUES.includes(service as ServiceLine) || !CATEGORY_VALUES.includes(category as Category)) {
    return NextResponse.json({ error: 'invalid service or category' }, { status: 400 });
  }

  const rows = await cellToMoveLines({
    contractId, yearIndex,
    scenario: scenario as 'initial' | 'revised' | 'reforecast',
    serviceLine: service as ServiceLine,
    category: category as Category,
    month,
  });

  return NextResponse.json({ rows });
}
