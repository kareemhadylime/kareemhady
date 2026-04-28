import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, Building2, Warehouse, Calendar, Hash, AlertCircle } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../../_components/beithady-shell';
import { getGrn, GRN_STATUS_LABEL } from '@/lib/beithady/inventory/grn';
import { GrnTransitionButtons } from '../_components/grn-transition-buttons';

export const dynamic = 'force-dynamic';

export default async function GrnDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { roles } = await requireBeithadyPermission('inventory', 'read');
  const { id } = await params;
  const grn = await getGrn(id);
  if (!grn) notFound();

  const canWrite = roles.some(r => ['admin', 'manager', 'ops', 'warehouse_manager'].includes(r));
  const canApprove = grn.required_approvers.some(r => roles.includes(r as typeof roles[number]));

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Inventory', href: '/beithady/inventory' },
        { label: 'Receiving (GRN)', href: '/beithady/inventory/grn' },
        { label: grn.grn_no },
      ]}
      containerClass="max-w-5xl"
    >
      <BeithadyHeader
        eyebrow={`Beit Hady · Inventory · Receiving · ${grn.grn_no}`}
        title={grn.grn_no}
        subtitle={`From ${grn.vendor_name} (${grn.vendor_code}) → ${grn.warehouse_name} (${grn.warehouse_code})`}
      />

      {/* Status header */}
      <section className="ix-card p-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[11px] px-2 py-0.5 rounded font-medium ${GRN_STATUS_LABEL[grn.status].tone}`}>
              {GRN_STATUS_LABEL[grn.status].en}
            </span>
            {grn.required_approvers.length > 0 && grn.status === 'pending_approval' && (
              <span className="text-[10px] text-amber-700">
                Needs: {grn.required_approvers.join(' + ')}
              </span>
            )}
            {grn.status === 'rejected' && grn.rejected_reason && (
              <span className="text-[10px] text-rose-700 italic">
                <AlertCircle size={10} className="inline mr-1" />
                {grn.rejected_reason}
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 inline-flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1"><Building2 size={11} /> {grn.vendor_name}</span>
            <span className="inline-flex items-center gap-1"><Warehouse size={11} /> {grn.warehouse_code}</span>
            <span className="inline-flex items-center gap-1"><Calendar size={11} /> Received {new Date(grn.received_at).toLocaleDateString('en-GB')}</span>
            {grn.posted_at && (
              <span className="inline-flex items-center gap-1 text-emerald-700"><Hash size={11} /> Posted {new Date(grn.posted_at).toLocaleString('en-GB')}</span>
            )}
          </div>
        </div>

        <div className="text-right">
          <div className="text-[10px] uppercase tracking-wide text-slate-500">Sub-total</div>
          <div className="text-2xl font-bold tabular-nums" style={{ color: 'var(--bh-navy)' }}>
            {grn.computed_total_egp.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            <span className="text-sm text-slate-500 ml-1">EGP</span>
          </div>
        </div>
      </section>

      {/* Lines */}
      <section className="ix-card overflow-hidden">
        <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
          <h3 className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
            Lines ({grn.lines.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-3 py-1.5 w-10">#</th>
                <th className="text-left px-3 py-1.5">Item</th>
                <th className="text-right px-3 py-1.5">Qty</th>
                <th className="text-right px-3 py-1.5">Rejected</th>
                <th className="text-right px-3 py-1.5">Unit cost</th>
                <th className="text-left px-3 py-1.5">Batch</th>
                <th className="text-left px-3 py-1.5">Expiry</th>
                <th className="text-right px-3 py-1.5">Total (EGP)</th>
              </tr>
            </thead>
            <tbody>
              {grn.lines.map(l => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 text-slate-400 tabular-nums">{l.line_no}</td>
                  <td className="px-3 py-1.5">
                    <div className="font-mono text-[11px]">{l.item_sku}</div>
                    <div className="text-[10px] text-slate-500">{l.item_name_en}</div>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{l.qty_received} {l.item_uom}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-slate-500">{l.qty_rejected || '—'}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {Number(l.unit_cost_egp).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[10px] text-slate-500">
                    {l.batch_no === '__bulk__' ? '—' : l.batch_no}
                  </td>
                  <td className="px-3 py-1.5 text-[10px] text-slate-500">
                    {l.expiry_date || '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">
                    {(Number(l.qty_received) * Number(l.unit_cost_egp)).toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* State-machine actions */}
      {canWrite && (
        <GrnTransitionButtons
          grnId={grn.id}
          status={grn.status}
          requiredApprovers={grn.required_approvers}
          canApprove={canApprove}
        />
      )}

      {grn.notes && (
        <section className="ix-card p-3">
          <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium mb-1">Notes</div>
          <div className="text-xs text-slate-700 whitespace-pre-wrap">{grn.notes}</div>
        </section>
      )}

      <Link href="/beithady/inventory/grn" className="text-xs text-cyan-700 hover:underline inline-flex items-center gap-1">
        <ChevronLeft size={12} /> Back to GRN list
      </Link>

      <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Beit Hady — Inventory · GRN · Phase M.7 · Posting via beithady_inv_post_grn (advisory-locked per item)
      </footer>
    </BeithadyShell>
  );
}
