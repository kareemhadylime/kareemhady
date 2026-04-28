import Link from 'next/link';
import { Plus, Search, ExternalLink, Building2 } from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { listVendors, VENDOR_STATUS_LABEL } from '@/lib/beithady/inventory/vendors';
import { listCategories } from '@/lib/beithady/inventory/catalog';
import { VendorFormButton } from './_components/vendor-form-button';
import { VendorActionsDropdown } from './_components/vendor-actions-dropdown';

export const dynamic = 'force-dynamic';

export default async function InventoryVendorsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string; category?: string }>;
}) {
  const { roles } = await requireBeithadyPermission('inventory', 'read');
  const sp = await searchParams;
  const canWrite = roles.some(r => ['admin', 'manager', 'ops', 'warehouse_manager'].includes(r));
  const canApprove = roles.some(r => ['admin', 'manager', 'warehouse_manager'].includes(r));

  const [vendors, categories] = await Promise.all([
    listVendors({
      search: sp.search,
      status: (sp.status as 'all') || 'all',
      category: sp.category,
    }),
    listCategories(),
  ]);

  const statusCounts = {
    draft: vendors.filter(v => v.status === 'draft').length,
    kyc: vendors.filter(v => v.status === 'kyc').length,
    approved: vendors.filter(v => v.status === 'approved').length,
    suspended: vendors.filter(v => v.status === 'suspended').length,
  };

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Inventory', href: '/emails/beithady/inventory' },
        { label: 'Vendors' },
      ]}
      containerClass="max-w-7xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Inventory · Vendors / Registration"
        title="Vendors / Registration"
        subtitle={`${vendors.length} vendor${vendors.length === 1 ? '' : 's'} (${statusCounts.approved} approved · ${statusCounts.kyc} pending KYC · ${statusCounts.draft} draft · ${statusCounts.suspended} suspended). KYC workflow with payment terms + banking + price-history.`}
      />

      {/* Status filter chips */}
      <section className="flex items-center gap-2 flex-wrap text-xs">
        <StatusChip label="All" href="/emails/beithady/inventory/vendors" active={!sp.status || sp.status === 'all'} count={vendors.length} tone="neutral" />
        <StatusChip label="Approved" href="?status=approved" active={sp.status === 'approved'} count={statusCounts.approved} tone="emerald" />
        <StatusChip label="KYC" href="?status=kyc" active={sp.status === 'kyc'} count={statusCounts.kyc} tone="amber" />
        <StatusChip label="Draft" href="?status=draft" active={sp.status === 'draft'} count={statusCounts.draft} tone="slate" />
        <StatusChip label="Suspended" href="?status=suspended" active={sp.status === 'suspended'} count={statusCounts.suspended} tone="rose" />
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
              placeholder="Search name / code / contact / phone…"
              className="ix-input pl-8 w-[280px]"
            />
          </div>
          <select name="category" defaultValue={sp.category || ''} className="ix-input">
            <option value="">All categories</option>
            {categories.map(c => <option key={c.id} value={c.code}>{c.name_en}</option>)}
          </select>
          <button type="submit" className="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm">
            Apply
          </button>
          {(sp.search || sp.category) && (
            <Link href={`/emails/beithady/inventory/vendors${sp.status ? `?status=${sp.status}` : ''}`} className="text-[11px] text-slate-500 hover:text-slate-700">Clear</Link>
          )}
        </form>

        {canWrite && (
          <VendorFormButton
            mode="create"
            categories={categories}
            triggerLabel={<><Plus size={14} /> Register vendor</>}
            triggerClass="px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 inline-flex items-center gap-1.5 shadow-sm"
          />
        )}
      </section>

      {/* Vendors table */}
      <section className="ix-card overflow-hidden">
        {vendors.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            <Building2 size={32} className="mx-auto text-slate-300 mb-2" />
            <p>No vendors match your filter.</p>
            {canWrite && (
              <p className="text-[11px] mt-2">Click <strong>Register vendor</strong> to start the KYC workflow.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="text-left px-3 py-2">Code</th>
                  <th className="text-left px-3 py-2">Vendor</th>
                  <th className="text-left px-3 py-2">Categories</th>
                  <th className="text-left px-3 py-2">Contact</th>
                  <th className="text-right px-3 py-2">Items</th>
                  <th className="text-right px-3 py-2">Total purchased</th>
                  <th className="text-left px-3 py-2">Last GRN</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th className="text-right px-3 py-2">{canWrite && 'Actions'}</th>
                </tr>
              </thead>
              <tbody>
                {vendors.map(v => (
                  <tr key={v.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-[11px]">{v.code}</td>
                    <td className="px-3 py-2">
                      <div className="font-medium">{v.trade_name || v.legal_name}</div>
                      {v.trade_name && <div className="text-[10px] text-slate-500">{v.legal_name}</div>}
                      <div className="text-[10px] text-slate-400">
                        {v.country} · {v.payment_terms_days} days · {v.default_currency}
                      </div>
                    </td>
                    <td className="px-3 py-2 max-w-[180px]">
                      <div className="flex flex-wrap gap-1">
                        {v.primary_categories.slice(0, 3).map(c => (
                          <span key={c} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">{c}</span>
                        ))}
                        {v.primary_categories.length > 3 && (
                          <span className="text-[10px] text-slate-400">+{v.primary_categories.length - 3}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-[11px]">
                      {v.contact_name && <div>{v.contact_name}</div>}
                      {v.contact_phone && <div className="text-slate-500 font-mono">{v.contact_phone}</div>}
                      {v.whatsapp_e164 && <div className="text-emerald-700 text-[10px]">WA: {v.whatsapp_e164}</div>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{v.item_count}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {v.total_purchased_egp > 0
                        ? `${Number(v.total_purchased_egp).toLocaleString('en-US', { maximumFractionDigits: 0 })} EGP`
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-[10px] text-slate-500">
                      {v.last_grn_at ? new Date(v.last_grn_at).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${VENDOR_STATUS_LABEL[v.status].tone}`}>
                        {VENDOR_STATUS_LABEL[v.status].en}
                      </span>
                      {v.amazon_eg_storefront_url && (
                        <a href={v.amazon_eg_storefront_url} target="_blank" rel="noreferrer" className="ml-2 text-[10px] text-cyan-700 hover:underline inline-flex items-center gap-0.5">
                          Amazon <ExternalLink size={9} />
                        </a>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {canWrite && (
                        <VendorActionsDropdown
                          vendor={v}
                          categories={categories}
                          canApprove={canApprove}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Beit Hady — Inventory · Vendors / Registration · Phase M.5 · KYC + price-history graph (drill-in)
      </footer>
    </BeithadyShell>
  );
}

function StatusChip({
  label, href, active, count, tone,
}: {
  label: string;
  href: string;
  active: boolean;
  count: number;
  tone: 'emerald' | 'amber' | 'slate' | 'rose' | 'neutral';
}) {
  const cls = active
    ? tone === 'emerald' ? 'bg-emerald-600 text-white border-emerald-600'
    : tone === 'amber' ? 'bg-amber-600 text-white border-amber-600'
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
