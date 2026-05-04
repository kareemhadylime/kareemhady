import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listCategories, createCategory } from '@/lib/beithady/fnb/repo';
import { CategorySchema } from '@/lib/beithady/fnb/types';

export async function GET() {
  await requireBeithadyPermission('fnb', 'read');
  return NextResponse.json({ categories: await listCategories() });
}

export async function POST(req: NextRequest) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const body = await req.json();
  const parsed = CategorySchema.omit({ id: true }).parse(body);
  const created = await createCategory(parsed, { actor_user_id: user.id });
  return NextResponse.json({ category: created }, { status: 201 });
}
