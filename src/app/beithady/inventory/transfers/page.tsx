import Link from 'next/link';
import { Plus, ArrowLeftRight, ChevronRight, Package } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { listTransfers } from '@/lib/beithady/inventory/transfers';

export const dynamic = 'force-dynamic';

export default async function InventoryTransfersListPage() {
  const { roles } = await requireBeithadyPermission('inventory', 'read');
  const canWrite = roles.some(r => ['admin', 'manager', 'ops', 'warehouse_manager'].includes(r));
  const transfers = await listTransfers({ limit: 100 });

  const totalValue = transfers.reduce((s, t) => s + t.total_value_egp, 0);

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Inventory', href: '/beithady/inventory' },
        { label: 'Transfers' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Inventory · Transfers"
        title="Warehouse transfers"
        subtitle={`${transfers.length} transfer${transfers.length === 1 ? '' : 's'} on record · ${totalValue.toLocaleString('en-US', { maximumFractionDigits: 0 })} EGP total moved. Atomic Out/In legs (FIFO source pick) — both legs commit or neither.`}
      />

      <section className="flex items-center justify-end">
        {canWrite && (
          <Link href="/beithady/inventory/transfers/new"
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1.5 shadow-sm">
            <Plus size={14} /> New transfer
          </Link>
        )}
      </section>

      <section className="ix-card overflow-hidden">
        {transfers.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            <ArrowLeftRight size={32} className="mx-auto text-slate-300 mb-2" />
            <p>No transfers yet.</p>
            {canWrite && <p className="text-[11px] mt-2">Click <strong>New transfer</strong> to move stock between warehouses.</p>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2">When</th>
                  <th className="text-left px-3 py-2">Source</th>
                  <th className="text-left px-3 py-2"></th>
                  <th className="text-left px-3 py-2">Destination</th>
                  <th className="text-right px-3 py-2">Lines</th>
                  <th className="text-right px-3 py-2">Total qty</th>
                  <th className="text-right px-3 py-2">Value (EGP)</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {transfers.map(t => (
                  <tr key={t.transfer_id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 text-[11px] text-slate-500">
                      {new Date(t.posted_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{t.src_warehouse_name}</div>
                      <div className="text-[10px] font-mono text-slate-400">{t.src_warehouse_code}</div>
                    </td>
                    <td className="px-3 py-2 text-slate-300"><ArrowLeftRight size={12} /></td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{t.dst_warehouse_name}</div>
                      <div className="text-[10px] font-mono text-slate-400">{t.dst_warehouse_code}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{t.line_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                      {t.total_qty.toLocaleString('en-US', { maximumFractionDigits: 1 })}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">
                      {t.total_value_egp.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/beithady/inventory/transfers/${t.transfer_id}`} className="text-cyan-700 hover:text-cyan-900 inline-flex items-center gap-0.5 text-[11px]">
                        Open <ChevronRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-[11px] text-slate-400 inline-flex items-center gap-1">
        <Package size={11} /> Each transfer is two paired transactions in the ledger (transfer_out + transfer_in) sharing the same doc_id. Stock decrements at source and increments at destination with the same FIFO-picked cost.
      </p>

      <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Beit Hady — Inventory · Transfers · Phase M.9 · Atomic via beithady_inv_post_transfer (advisory-locked per item)
      </footer>
    </BeithadyShell>
  );
}
