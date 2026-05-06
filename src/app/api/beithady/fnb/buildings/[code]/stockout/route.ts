import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { upsertBuildingOverride } from '@/lib/beithady/fnb/repo';

const Body = z.object({
  item_id: z.string().uuid(),
  is_out_of_stock: z.boolean(),
});

interface Ctx { params: Promise<{ code: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { code } = await ctx.params;
  const { item_id, is_out_of_stock } = Body.parse(await req.json());
  await upsertBuildingOverride({
    building_code: code,
    item_id,
    is_out_of_stock,
  }, { actor_user_id: user.id });
  return NextResponse.json({ ok: true });
}
