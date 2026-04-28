import Link from 'next/link';
import { Plus, Search, PackagePlus, ChevronRight, AlertCircle } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { listGrns, GRN_STATUS_LABEL, type GrnStatus } from '@/lib/beithady/inventory/grn';

export const dynamic = 'force-dynamic';

export default async function InventoryGrnListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string }>;
}) {
  const { roles } = await requireBeithadyPermission('inventory', 'read');
  const sp = await searchParams;
  const canWrite = roles.some(r => ['admin', 'manager', 'ops', 'warehouse_manager'].includes(r));

  const grns = await listGrns({
    status: (sp.status as GrnStatus | 'all') || 'all',
    search: sp.search,
  });

  const statusCounts = {
    draft: grns.filter(g => g.status === 'draft').length,
    submitted: grns.filter(g => g.status === 'submitted').length,
    pending_approval: grns.filter(g => g.status === 'pending_approval').length,
    approved: grns.filter(g => g.status === 'approved').length,
    posted: grns.filter(g => g.status === 'posted').length,
    rejected: grns.filter(g => g.status === 'rejected').length,
  };

  const pendingApproval = statusCounts.pending_approval;
  const readyToPost = statusCounts.approved;

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Inventory', href: '/emails/beithady/inventory' },
        { label: 'Receiving (GRN)' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Inventory · Receiving"
        title="Goods Receipt Notes"
        subtitle={`${grns.length} GRN${grns.length === 1 ? '' : 's'} (${statusCounts.posted} posted · ${pendingApproval} awaiting approval · ${readyToPost} ready to post). Posting writes to the immutable transaction ledger and recomputes weighted-average cost.`}
      />

      {(pendingApproval > 0 || readyToPost > 0) && (
        <section className="ix-card border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <AlertCircle size={14} className="inline mr-1.5" />
          {pendingApproval > 0 && (
            <>
              <strong>{pendingApproval}</strong> GRN{pendingApproval === 1 ? '' : 's'} awaiting approval
              {readyToPost > 0 ? ' · ' : '. '}
            </>
          )}
          {readyToPost > 0 && (
            <>
              <strong>{readyToPost}</strong> approved & ready to post.
            </>
          )}
        </section>
      )}

      {/* Filter chips */}
      <section className="flex items-center gap-2 flex-wrap text-xs">
        <Chip href="?" active={!sp.status || sp.status === 'all'} label="All" count={grns.length} tone="neutral" />
        <Chip href="?status=draft" active={sp.status === 'draft'} label="Draft" count={statusCounts.draft} tone="slate" />
        <Chip href="?status=pending_approval" active={sp.status === 'pending_approval'} label="Pending approval" count={statusCounts.pending_approval} tone="amber" />
        <Chip href="?status=approved" active={sp.status === 'approved'} label="Approved" count={statusCounts.approved} tone="violet" />
        <Chip href="?status=posted" active={sp.status === 'posted'} label="Posted" count={statusCounts.posted} tone="emerald" />
        <Chip href="?status=rejected" active={sp.status === 'rejected'} label="Rejected" count={statusCounts.rejected} tone="rose" />
      </section>

      {/* Action bar */}
      <section className="flex items-center justify-between gap-3 flex-wrap">
        <form action="" method="get" className="flex items-center gap-2 flex-wrap">
          {sp.status && <input type="hidden" name="status" value={sp.status} />}
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="search"
              name="search"
              defaultValue={sp.search || ''}
              placeholder="Search GRN # / notes…"
              className="ix-input pl-8 w-[260px]"
            />
          </div>
          <button type="submit" className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm">Apply</button>
          {(sp.search || sp.status) && (
            <Link href="/emails/beithady/inventory/grn" className="text-[11px] text-slate-500 hover:text-slate-700">Clear</Link>
          )}
        </form>
        {canWrite && (
          <Link
            href="/emails/beithady/inventory/grn/new"
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1.5 shadow-sm"
          >
            <Plus size={14} /> New GRN
          </Link>
        )}
      </section>

      {/* GRNs table */}
      <section className="ix-card overflow-hidden">
        {grns.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            <PackagePlus size={32} className="mx-auto text-slate-300 mb-2" />
            <p>No GRNs match your filter.</p>
            {canWrite && grns.length === 0 && !sp.status && !sp.search && (
              <p className="text-[11px] mt-2">Click <strong>New GRN</strong> to record your first goods receipt.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2">GRN #</th>
                  <th className="text-left px-3 py-2">Vendor</th>
                  <th className="text-left px-3 py-2">Warehouse</th>
                  <th className="text-right px-3 py-2">Lines</th>
                  <th className="text-right px-3 py-2">Sub-total (EGP)</th>
                  <th className="text-left px-3 py-2">Received</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {grns.map(g => (
                  <tr key={g.id} className="border-t border-slate-100 hover:bg-slate-50 cursor-pointer">
                    <td className="px-3 py-2 font-mono text-[11px]">
                      <Link href={`/emails/beithady/inventory/grn/${g.id}`} className="hover:text-cyan-700 hover:underline">
                        {g.grn_no}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{g.vendor_name}</td>
                    <td className="px-3 py-2 text-[11px]">
                      <div>{g.warehouse_name}</div>
                      <div className="text-[10px] font-mono text-slate-400">{g.warehouse_code}</div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{g.line_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {Number(g.sub_total_egp).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-slate-500">
                      {new Date(g.received_at).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${GRN_STATUS_LABEL[g.status].tone}`}>
                        {GRN_STATUS_LABEL[g.status].en}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/emails/beithady/inventory/grn/${g.id}`} className="text-cyan-700 hover:text-cyan-900 inline-flex items-center gap-0.5 text-[11px]">
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

      <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Beit Hady — Inventory · Receiving · Phase M.7 · Atomic posting via beithady_inv_post_grn RPC (advisory-locked per item)
      </footer>
    </BeithadyShell>
  );
}

function Chip({
  href, active, label, count, tone,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  tone: 'neutral' | 'slate' | 'amber' | 'violet' | 'emerald' | 'rose';
}) {
  const cls = active
    ? tone === 'amber' ? 'bg-amber-600 text-white border-amber-600'
    : tone === 'violet' ? 'bg-violet-600 text-white border-violet-600'
    : tone === 'emerald' ? 'bg-emerald-600 text-white border-emerald-600'
    : tone === 'rose' ? 'bg-rose-600 text-white border-rose-600'
    : tone === 'slate' ? 'bg-slate-700 text-white border-slate-700'
    : 'bg-slate-900 text-white border-slate-900'
    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300';
  return (
    <Link href={href} className={`px-2.5 py-1 rounded-full border text-[11px] font-medium ${cls}`}>
      {label} <span className="opacity-70 ml-1">({count})</span>
    </Link>
  );
}
