import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listItems, createItem } from '@/lib/beithady/fnb/repo';
import { ItemSchema } from '@/lib/beithady/fnb/types';

export async function GET(req: NextRequest) {
  await requireBeithadyPermission('fnb', 'read');
  const url = new URL(req.url);
  const categoryId = url.searchParams.get('category_id') || undefined;
  const includeDeleted = url.searchParams.get('include_deleted') === '1';
  return NextResponse.json({
    items: await listItems({ categoryId, includeDeleted }),
  });
}

export async function POST(req: NextRequest) {
  const { user } = await requireBeithadyPermission('fnb', 'full');
  const body = await req.json();
  const parsed = ItemSchema.omit({ id: true }).parse(body);
  const created = await createItem(parsed, { actor_user_id: user.id });
  return NextResponse.json({ item: created }, { status: 201 });
}
