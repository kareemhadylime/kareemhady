import Link from 'next/link';
import { Plus, Bot, AlertCircle } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { listConsumptionRules, FORMULA_KIND_LABEL, SCOPE_LABEL } from '@/lib/beithady/inventory/rules';
import { listItems } from '@/lib/beithady/inventory/catalog';
import { listAllWarehouses, BEITHADY_BUILDING_CODES } from '@/lib/beithady/inventory/warehouses';
import { RuleFormButton } from './_components/rule-form-button';
import { RuleRowActions } from './_components/rule-row-actions';

export const dynamic = 'force-dynamic';

export default async function ConsumptionRulesPage() {
  const { roles } = await requireBeithadyPermission('inventory', 'read');
  const canWrite = roles.some(r => ['admin', 'manager', 'ops', 'warehouse_manager'].includes(r));

  const [rules, items, warehouses] = await Promise.all([
    listConsumptionRules(),
    listItems({ status: 'active' }),
    listAllWarehouses({ includeInactive: false }),
  ]);

  const buildingOpts = BEITHADY_BUILDING_CODES.map(bc => ({
    code: bc,
    label: warehouses.find(w => w.building_code === bc && !w.parent_id)?.name_en || bc,
  }));

  const itemOpts = items.map(it => ({
    id: it.id,
    label: `${it.sku} — ${it.name_en} (${it.uom})`,
    pack_volume_value: it.pack_volume_value,
    pack_volume_uom: it.pack_volume_uom,
  }));

  const byScope = {
    global: rules.filter(r => r.scope === 'global'),
    building: rules.filter(r => r.scope === 'building'),
    listing: rules.filter(r => r.scope === 'listing'),
    category: rules.filter(r => r.scope === 'category'),
  };

  const activeCount = rules.filter(r => r.active).length;

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Inventory', href: '/beithady/inventory' },
        { label: 'Consumption rules' },
      ]}
      containerClass="max-w-6xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Inventory · Auto-Issue Rules"
        title="Consumption rules"
        subtitle={`${rules.length} rule${rules.length === 1 ? '' : 's'} (${activeCount} active). Daily cron at Cairo 11:00 (post-DST 12:00) scans confirmed reservations checking in today and auto-issues stock per these formulas.`}
      />

      {rules.length === 0 && (
        <section className="ix-card border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertCircle size={16} className="inline mr-2" />
          <strong>No rules yet — auto-issue cron is inert.</strong> Add your first rule
          (e.g. &ldquo;1 toilet roll per 2 guests per night, scope=global, item=Fine 12-roll
          mega&rdquo;) and the next cron tick will start posting issues automatically.
        </section>
      )}

      <section className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          <Bot size={12} className="inline mr-1 text-cyan-600" />
          Posted issues appear in <Link href="/beithady/inventory/issue?type=per_reservation" className="underline">Dispensing → Per reservation</Link> with <code className="font-mono text-[10px]">created_via=auto_rule</code>.
        </p>
        {canWrite && (
          <RuleFormButton
            mode="create"
            items={itemOpts}
            buildings={buildingOpts}
            triggerLabel={<><Plus size={14} /> Add rule</>}
            triggerClass="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1.5 shadow-sm"
          />
        )}
      </section>

      {(['global', 'building', 'listing', 'category'] as const).map(scope => {
        const list = byScope[scope];
        if (list.length === 0) return null;
        return (
          <section key={scope} className="space-y-2">
            <h2 className="text-xs uppercase tracking-wide text-slate-500 font-semibold">
              {SCOPE_LABEL[scope]} ({list.length})
            </h2>
            <div className="ix-card overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                  <tr>
                    {scope !== 'global' && <th className="text-left px-3 py-2">Scope value</th>}
                    <th className="text-left px-3 py-2">Item</th>
                    <th className="text-left px-3 py-2">Formula</th>
                    <th className="text-right px-3 py-2">Qty</th>
                    <th className="text-right px-3 py-2">Loss factor</th>
                    <th className="text-left px-3 py-2">Notes</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-right px-3 py-2">{canWrite && 'Actions'}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(r => (
                    <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                      {scope !== 'global' && (
                        <td className="px-3 py-2 font-mono text-[11px]">{r.scope_value || '—'}</td>
                      )}
                      <td className="px-3 py-2">
                        <div className="font-mono text-[11px]">{r.item_sku}</div>
                        <div className="text-[10px] text-slate-500">{r.item_name_en}</div>
                      </td>
                      <td className="px-3 py-2 text-[11px]">{FORMULA_KIND_LABEL[r.formula_kind]}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {r.qty} {r.item_uom}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{r.loss_factor_pct}%</td>
                      <td className="px-3 py-2 text-[10px] text-slate-500 italic max-w-[180px] truncate">
                        {r.notes || '—'}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${r.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                          {r.active ? 'Active' : 'Disabled'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {canWrite && (
                          <RuleRowActions
                            rule={r}
                            items={itemOpts}
                            buildings={buildingOpts}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Beit Hady — Inventory · Consumption rules · Phase M.11 · Drives auto-issue cron at Cairo 11:00 daily
      </footer>
    </BeithadyShell>
  );
}
