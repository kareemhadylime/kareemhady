import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listItems, updateItem } from '@/lib/beithady/fnb/repo';
import { BulkPriceUpdatePayloadSchema } from '@/lib/beithady/fnb/types';

export async function POST(req: NextRequest) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const parsedResult = BulkPriceUpdatePayloadSchema.safeParse(await req.json());
  if (!parsedResult.success) {
    return NextResponse.json({ error: 'invalid_input', issues: parsedResult.error.issues }, { status: 400 });
  }
  const parsed = parsedResult.data;

  const items = await listItems({
    categoryId: parsed.category_id ?? undefined,
  });
  const targets = parsed.item_ids.length > 0
    ? items.filter(i => parsed.item_ids.includes(i.id!))
    : items;
  const factor = 1 + parsed.delta_pct / 100;

  let count = 0;
  for (const it of targets) {
    const newPrice = Math.round(it.price_usd * factor * 100) / 100;
    if (newPrice === it.price_usd) continue;
    await updateItem(it.id!, { price_usd: newPrice }, { actor_user_id: user.id });
    count++;
  }
  return NextResponse.json({ updated: count });
}
