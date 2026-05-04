import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { deleteRecipeLine } from '@/lib/beithady/fnb/repo';

interface Ctx { params: Promise<{ id: string; lineId: string }> }

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { lineId } = await ctx.params;
  await deleteRecipeLine(lineId, { actor_user_id: user.id });
  return NextResponse.json({ ok: true });
}
