import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { updateModifier, deleteModifier } from '@/lib/beithady/fnb/repo';
import { ModifierSchema } from '@/lib/beithady/fnb/types';

interface Ctx { params: Promise<{ id: string; modId: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { modId } = await ctx.params;
  const body = await req.json();
  const parsed = ModifierSchema.partial().omit({ id: true }).parse(body);
  return NextResponse.json({
    modifier: await updateModifier(modId, parsed, { actor_user_id: user.id }),
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { modId } = await ctx.params;
  await deleteModifier(modId, { actor_user_id: user.id });
  return NextResponse.json({ ok: true });
}
