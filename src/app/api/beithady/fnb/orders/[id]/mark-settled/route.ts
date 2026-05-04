import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { markOrderSettled } from '@/lib/beithady/fnb/settlement';

const Body = z.object({
  guesty_charge_id: z.string().max(120).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

interface Ctx { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const parsed = Body.parse(body);
  try {
    await markOrderSettled(id, { actor_user_id: user.id, ...parsed });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'unknown';
    if (msg === 'order_not_found') return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (msg === 'order_not_settleable') return NextResponse.json({ error: 'order_not_settleable' }, { status: 409 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}
