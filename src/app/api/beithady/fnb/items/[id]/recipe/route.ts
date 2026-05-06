import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listRecipeLines, upsertRecipeLine, computeRecipeCost } from '@/lib/beithady/fnb/repo';

const Body = z.object({
  inventory_item_id: z.string().uuid(),
  quantity: z.number().positive().multipleOf(0.001),
  notes: z.string().nullable().optional(),
});

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  await requireBeithadyPermission('fnb', 'read');
  const { id } = await ctx.params;
  const [lines, cost] = await Promise.all([
    listRecipeLines(id),
    computeRecipeCost(id),
  ]);
  return NextResponse.json({ lines, cost });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = Body.parse(body);
  const line = await upsertRecipeLine({
    item_id: id,
    inventory_item_id: parsed.inventory_item_id,
    quantity: parsed.quantity,
    notes: parsed.notes ?? null,
  }, { actor_user_id: user.id });
  return NextResponse.json({ line }, { status: 201 });
}
