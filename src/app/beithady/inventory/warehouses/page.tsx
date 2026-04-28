import { Plus } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import {
  buildWarehouseTree,
  fetchWarehouseStats,
  getWarehousePin,
  BEITHADY_BUILDING_CODES,
  type BeithadyBuildingCode,
} from '@/lib/beithady/inventory/warehouses';
import { WarehouseTreePanel } from './_components/warehouse-tree-panel';
import { WarehouseFormButton } from './_components/warehouse-form-button';

export const dynamic = 'force-dynamic';

const BUILDING_LABEL: Record<string, string> = {
  'BH-26': 'BH-26 — 22 active units',
  'BH-73': 'BH-73 — 28 bookable atoms',
  'BH-435': 'BH-435 — 14 units (mgmt fee model)',
  'BH-OK': 'BH-OK — 9 active units',
  'BH-34': 'BH-34 — Upcoming building',
  OTHER: 'Other — out-of-scope units',
  UNGROUPED: 'Ungrouped',
};

export default async function InventoryWarehousesPage({
  searchParams,
}: {
  searchParams: Promise<{ inactive?: string }>;
}) {
  const { roles } = await requireBeithadyPermission('inventory', 'read');
  const sp = await searchParams;
  const includeInactive = sp.inactive === '1';
  const canWrite = roles.some(r => ['admin', 'manager', 'ops', 'warehouse_manager'].includes(r));

  const [tree, stats] = await Promise.all([
    buildWarehouseTree({ includeInactive }),
    fetchWarehouseStats(),
  ]);

  // Resolve PINs for every main warehouse (parent_id IS NULL with building_code)
  const allMains = Object.values(tree.byBuilding).flat();
  const pinPairs = await Promise.all(
    allMains.map(async w => [w.code, await getWarehousePin(w.code)] as const),
  );
  const pinByCode = new Map(pinPairs);

  // Total counters for the header
  const totalWarehouses = allMains.reduce((sum, m) => sum + 1 + m.children.length, 0)
    + tree.ungrouped.length;
  const totalSubs = allMains.reduce((sum, m) => sum + m.children.length, 0);

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Inventory', href: '/beithady/inventory' },
        { label: 'Warehouses' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Inventory · Warehouses"
        title="Warehouses"
        subtitle={`${totalWarehouses} warehouse${totalWarehouses === 1 ? '' : 's'} (${totalSubs} sub-warehouse${totalSubs === 1 ? '' : 's'}). Hybrid model: locational tree + categorical tag.`}
      />

      {/* Action bar */}
      <section className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-xs">
          <a
            href="?inactive=0"
            className={`px-2 py-1 rounded border ${!includeInactive ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-white text-slate-500 border-slate-200'}`}
          >
            Active only
          </a>
          <a
            href="?inactive=1"
            className={`px-2 py-1 rounded border ${includeInactive ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-500 border-slate-200'}`}
          >
            Show inactive
          </a>
        </div>
        {canWrite && (
          <WarehouseFormButton
            mode="create"
            triggerLabel={
              <>
                <Plus size={14} /> Add warehouse
              </>
            }
            triggerClass="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1.5 shadow-sm"
            allMains={allMains.map(m => ({
              id: m.id,
              code: m.code,
              name_en: m.name_en,
              building_code: m.building_code,
            }))}
          />
        )}
      </section>

      {/* Tree per building */}
      <section className="space-y-6">
        {BEITHADY_BUILDING_CODES.map(bc => {
          const mains = tree.byBuilding[bc] || [];
          if (mains.length === 0 && !includeInactive) return null;
          return (
            <div key={bc} className="space-y-2">
              <h2 className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
                {BUILDING_LABEL[bc] || bc}
              </h2>
              {mains.length === 0 ? (
                <div className="ix-card p-4 text-xs text-slate-400 italic">
                  No warehouse for this building.
                </div>
              ) : (
                mains.map(main => (
                  <WarehouseTreePanel
                    key={main.id}
                    node={main}
                    stats={stats}
                    pin={pinByCode.get(main.code) || null}
                    canWrite={canWrite}
                    allMainsForParent={allMains.map(m => ({
                      id: m.id,
                      code: m.code,
                      name_en: m.name_en,
                      building_code: m.building_code,
                    }))}
                  />
                ))
              )}
            </div>
          );
        })}

        {tree.ungrouped.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs uppercase tracking-wide text-rose-600 font-semibold">
              Orphaned (parent missing)
            </h2>
            {tree.ungrouped.map(node => (
              <WarehouseTreePanel
                key={node.id}
                node={node}
                stats={stats}
                pin={null}
                canWrite={canWrite}
                allMainsForParent={allMains.map(m => ({
                  id: m.id,
                  code: m.code,
                  name_en: m.name_en,
                  building_code: m.building_code,
                }))}
              />
            ))}
          </div>
        )}
      </section>

      <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Beit Hady — Inventory · Warehouses · Phase M.3
      </footer>
    </BeithadyShell>
  );
}
