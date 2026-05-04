import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listModifiers, createModifier } from '@/lib/beithady/fnb/repo';
import { ModifierSchema } from '@/lib/beithady/fnb/types';

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  await requireBeithadyPermission('fnb', 'read');
  const { id } = await ctx.params;
  return NextResponse.json({ modifiers: await listModifiers(id) });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = ModifierSchema.omit({ id: true }).parse({ ...body, item_id: id });
  return NextResponse.json({
    modifier: await createModifier(parsed, { actor_user_id: user.id }),
  }, { status: 201 });
}
