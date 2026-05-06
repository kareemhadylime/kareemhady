import 'server-only';
import { notFound } from 'next/navigation';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { getItem, listCategories } from '@/lib/beithady/fnb/repo';
import { ItemEditor } from './_components/item-editor';

export const dynamic = 'force-dynamic';

interface Ctx { params: Promise<{ id: string }> }

export default async function ItemEditorPage({ params }: Ctx) {
  await requireBeithadyPermission('fnb', 'full');
  const { id } = await params;
  const [item, categories] = await Promise.all([getItem(id), listCategories()]);
  if (!item) notFound();
  return <ItemEditor initialItem={item} categories={categories} />;
}
