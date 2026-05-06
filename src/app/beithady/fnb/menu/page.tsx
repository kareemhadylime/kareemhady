import 'server-only';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { listCategories, listItems } from '@/lib/beithady/fnb/repo';
import { CategoryTree } from './_components/category-tree';
import { BulkPriceDialog } from './_components/bulk-price-dialog';

export const dynamic = 'force-dynamic';

export default async function FnbMenuPage() {
  await requireBeithadyPermission('fnb', 'read');
  const [categories, items] = await Promise.all([listCategories(), listItems()]);
  return (
    <div className="grid grid-cols-12 gap-4">
      <aside className="col-span-12 md:col-span-4 lg:col-span-3 space-y-3">
        <BulkPriceDialog categories={categories} />
        <CategoryTree categories={categories} items={items} />
      </aside>
      <section className="col-span-12 md:col-span-8 lg:col-span-9">
        <div className="ix-card p-6 text-center text-slate-500">
          Select a category or item to edit.
        </div>
      </section>
    </div>
  );
}
