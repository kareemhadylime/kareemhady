import { searchCatalog } from '@/lib/fmplus/budget/catalog/search';
import { listOverridesForItem } from '@/lib/fmplus/budget/catalog/overrides';
import { budgetDb, TABLES } from '@/lib/fmplus/budget/db';
import { requireBudgetView } from '@/lib/fmplus/budget/permissions';
import type { ServiceLine, Category } from '@/lib/fmplus/budget/types';
import type { FmplusCatalogItem } from '@/lib/fmplus/budget/schema';
import { CatalogTable } from './_components/catalog-table';
import { OverrideSidePanel } from './_components/override-side-panel';

export const dynamic = 'force-dynamic';

interface CatalogPageProps {
  searchParams: Promise<{
    q?: string;
    service?: string;
    category?: string;
    active?: string;
    selected?: string;
  }>;
}

export default async function CatalogPage(props: CatalogPageProps) {
  const sp = await props.searchParams;
  const user = await requireBudgetView();

  // Validate filters against enums; ignore invalid values silently
  const SERVICE_VALUES: ServiceLine[] = ['hk', 'mep', 'landscape', 'security', 'pest_ctrl', 'waste_mgmt', 'back_office'];
  const CATEGORY_VALUES: Category[] = ['manning', 'ppe', 'tools', 'consumables', 'transport', 'it', 'governmental', 'other'];
  const service_line = SERVICE_VALUES.includes(sp.service as ServiceLine) ? (sp.service as ServiceLine) : undefined;
  const category = CATEGORY_VALUES.includes(sp.category as Category) ? (sp.category as Category) : undefined;

  const items = await searchCatalog({
    q: sp.q,
    service_line,
    category,
    is_active: sp.active === 'all' ? undefined : true,
    limit: 500,
  });

  // If a row is selected, fetch its details + cross-contract overrides + contract list
  let selectedItem: FmplusCatalogItem | null = null;
  let otherOverrides: Awaited<ReturnType<typeof listOverridesForItem>> = [];
  let contracts: { id: number; name: string }[] = [];
  if (sp.selected) {
    const id = Number(sp.selected);
    if (Number.isFinite(id)) {
      const sb = budgetDb();
      const { data: it } = await sb.from(TABLES.catalog).select('*').eq('id', id).single();
      selectedItem = (it as FmplusCatalogItem) ?? null;
      if (selectedItem) {
        otherOverrides = await listOverridesForItem(id);
        const { data: cs } = await sb.from(TABLES.contracts).select('id, name').order('name');
        contracts = (cs ?? []) as { id: number; name: string }[];
      }
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-0 min-h-[60vh] border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <CatalogTable
        items={items}
        selectedId={selectedItem?.id ?? null}
        canEdit={Boolean(user.is_admin)}
        currentSearch={{
          q: sp.q ?? '',
          service: service_line ?? '',
          category: category ?? '',
          active: sp.active ?? '',
        }}
      />
      <OverrideSidePanel
        item={selectedItem}
        otherOverrides={otherOverrides}
        contracts={contracts}
        canEdit={Boolean(user.is_admin)}
      />
    </div>
  );
}
