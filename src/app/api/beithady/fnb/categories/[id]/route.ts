import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { getCategory, updateCategory, deleteCategory } from '@/lib/beithady/fnb/repo';
import { CategorySchema } from '@/lib/beithady/fnb/types';

interface Ctx { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, ctx: Ctx) {
  await requireBeithadyPermission('fnb', 'read');
  const { id } = await ctx.params;
  const cat = await getCategory(id);
  if (!cat) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return NextResponse.json({ category: cat });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { id } = await ctx.params;
  const body = await req.json();
  const parsedResult = CategorySchema.partial().omit({ id: true }).safeParse(body);
  if (!parsedResult.success) {
    return NextResponse.json({ error: 'invalid_input', issues: parsedResult.error.issues }, { status: 400 });
  }
  const parsed = parsedResult.data;
  return NextResponse.json({
    category: await updateCategory(id, parsed, { actor_user_id: user.id }),
  });
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const { id } = await ctx.params;
  await deleteCategory(id, { actor_user_id: user.id });
  return NextResponse.json({ ok: true });
}
