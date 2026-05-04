import { NextResponse } from 'next/server';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import { searchCatalog } from '@/lib/fmplus/budget/catalog/search';
import type { ServiceLine, Category } from '@/lib/fmplus/budget/types';

const SERVICE_VALUES: ServiceLine[] = ['hk','mep','landscape','security','pest_ctrl','waste_mgmt','back_office'];
const CATEGORY_VALUES: Category[] = ['manning','ppe','tools','consumables','transport','it','governmental','other'];

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  await requireBudgetView();
  const url = new URL(req.url);
  const q = url.searchParams.get('q') ?? undefined;
  const service = url.searchParams.get('service') ?? undefined;
  const category = url.searchParams.get('category') ?? undefined;

  const items = await searchCatalog({
    q,
    service_line: SERVICE_VALUES.includes(service as ServiceLine) ? (service as ServiceLine) : undefined,
    category: CATEGORY_VALUES.includes(category as Category) ? (category as Category) : undefined,
    limit: 100,
  });
  return NextResponse.json(items);
}
