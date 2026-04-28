import Link from 'next/link';
import {
  LayoutDashboard,
  Warehouse,
  Boxes,
  Building2,
  PackageSearch,
  PackagePlus,
  PackageMinus,
  ArrowLeftRight,
  ClipboardCheck,
  ChevronRight,
  Smartphone,
  ShieldCheck,
  ScrollText,
  ShoppingBag,
} from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../_components/beithady-shell';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type InventorySnapshot = {
  total_stock_value_egp: number;
  items_below_reorder: number;
  pending_grns: number;
  pending_issues: number;
  pending_pos: number;
  warehouse_count: number;
  active_item_count: number;
  active_vendor_count: number;
};

async function getInventorySnapshot(): Promise<InventorySnapshot> {
  const sb = supabaseAdmin();

  const [stockValueQ, lowStockQ, pendingGrnsQ, pendingIssuesQ, pendingPosQ,
    warehousesQ, itemsQ, vendorsQ] = await Promise.all([
    sb.rpc('beithady_inventory_stock_value_egp').single().then(
      r => r,
      () => ({ data: null }),
    ),
    sb.from('beithady_inventory_items')
      .select('id, min_qty, beithady_inventory_stock!left(qty_on_hand)')
      .eq('active', true),
    sb.from('beithady_inventory_grns').select('id', { count: 'exact', head: true })
      .in('status', ['submitted', 'pending_approval']),
    sb.from('beithady_inventory_issues').select('id', { count: 'exact', head: true })
      .in('status', ['submitted', 'pending_approval']),
    sb.from('beithady_inventory_purchase_orders').select('id', { count: 'exact', head: true })
      .in('status', ['draft', 'pending_approval']),
    sb.from('beithady_inventory_warehouses').select('id', { count: 'exact', head: true })
      .eq('active', true),
    sb.from('beithady_inventory_items').select('id', { count: 'exact', head: true })
      .eq('active', true),
    sb.from('beithady_inventory_vendors').select('id', { count: 'exact', head: true })
      .eq('status', 'approved'),
  ]);

  // Fallback stock value calc — RPC doesn't exist yet, compute from rows.
  let stockValue = 0;
  const stockRows = await sb
    .from('beithady_inventory_stock')
    .select('qty_on_hand, avg_cost_egp');
  if (stockRows.data) {
    for (const r of stockRows.data as Array<{ qty_on_hand: number; avg_cost_egp: number }>) {
      stockValue += Number(r.qty_on_hand || 0) * Number(r.avg_cost_egp || 0);
    }
  }

  // Compute items below reorder (V1 simple: qty_on_hand summed across warehouses < min_qty)
  let belowReorder = 0;
  if (lowStockQ.data) {
    for (const it of lowStockQ.data as Array<{
      min_qty: number;
      beithady_inventory_stock: Array<{ qty_on_hand: number }> | null;
    }>) {
      const total = (it.beithady_inventory_stock || []).reduce(
        (s, r) => s + Number(r.qty_on_hand || 0), 0,
      );
      if (total < Number(it.min_qty || 0)) belowReorder++;
    }
  }

  return {
    total_stock_value_egp: stockValue,
    items_below_reorder: belowReorder,
    pending_grns: pendingGrnsQ.count || 0,
    pending_issues: pendingIssuesQ.count || 0,
    pending_pos: pendingPosQ.count || 0,
    warehouse_count: warehousesQ.count || 0,
    active_item_count: itemsQ.count || 0,
    active_vendor_count: vendorsQ.count || 0,
  };
}

export default async function InventoryLanding() {
  await requireBeithadyPermission('inventory', 'read');
  const snap = await getInventorySnapshot();
  const totalApprovals = snap.pending_grns + snap.pending_issues + snap.pending_pos;

  return (
    <BeithadyShell breadcrumbs={[{ label: 'Inventory' }]} containerClass="max-w-7xl">
      <BeithadyHeader
        eyebrow="Beit Hady · Inventory"
        title="Inventory"
        subtitle="Multi-warehouse stock control · Items + Vendors · Receiving + Dispensing + Transfers + Counts. Subsumes Phase L (Consumables)."
      />

      {/* KPI snapshot strip */}
      <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <SnapStat
          label="Stock value (EGP)"
          value={snap.total_stock_value_egp > 0
            ? snap.total_stock_value_egp.toLocaleString('en-US', { maximumFractionDigits: 0 })
            : '—'}
          tone="neutral"
        />
        <SnapStat
          label="Items below reorder"
          value={String(snap.items_below_reorder)}
          tone={snap.items_below_reorder > 0 ? 'amber' : 'neutral'}
        />
        <SnapStat
          label="Pending approvals"
          value={String(totalApprovals)}
          tone={totalApprovals > 0 ? 'amber' : 'neutral'}
        />
        <SnapStat
          label="Active warehouses"
          value={String(snap.warehouse_count)}
          tone="neutral"
        />
      </section>

      {/* 9 tab cards */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <InvCard
          href="/beithady/inventory/dashboard"
          icon={LayoutDashboard}
          title="Dashboard"
          description="KPIs · per-checkin cost calculator · 30-day forecast · reorder alerts · stockout risk."
          accent="cyan"
          badge={{ label: 'M.11', tone: 'gold' }}
        />
        <InvCard
          href="/beithady/inventory/warehouses"
          icon={Warehouse}
          title="Warehouses"
          description={`${snap.warehouse_count} active warehouse${snap.warehouse_count === 1 ? '' : 's'}. Tree view per building, add sub-warehouses.`}
          accent="emerald"
          badge={{ label: 'M.3', tone: 'gold' }}
        />
        <InvCard
          href="/beithady/inventory/items"
          icon={Boxes}
          title="Items / Catalog"
          description={`${snap.active_item_count} active item${snap.active_item_count === 1 ? '' : 's'}. Manual add or Excel import. AI Amazon-URL paste.`}
          accent="amber"
          badge={{ label: 'M.4', tone: 'gold' }}
        />
        <InvCard
          href="/beithady/inventory/vendors"
          icon={Building2}
          title="Vendors / Registration"
          description={`${snap.active_vendor_count} approved vendor${snap.active_vendor_count === 1 ? '' : 's'}. KYC workflow · payment terms · banking · price-history.`}
          accent="violet"
          badge={{ label: 'M.5', tone: 'gold' }}
        />
        <InvCard
          href="/beithady/inventory/stock"
          icon={PackageSearch}
          title="Stock"
          description="Balance per item × warehouse × batch. Drill into transaction ledger."
          accent="cyan"
          badge={{ label: 'M.6', tone: 'gold' }}
        />
        <InvCard
          href="/beithady/inventory/grn"
          icon={PackagePlus}
          title="Receiving (GRN)"
          description={snap.pending_grns > 0
            ? `${snap.pending_grns} pending approval. Vendor → PO match → QC photos → posting.`
            : 'Goods Receipt Notes. Vendor → PO match → QC photos → posting engine.'}
          accent="emerald"
          badge={{ label: 'M.7', tone: 'gold' }}
        />
        <InvCard
          href="/beithady/inventory/issue"
          icon={PackageMinus}
          title="Dispensing (Issue)"
          description={snap.pending_issues > 0
            ? `${snap.pending_issues} pending approval. 6 types · Welcome Tray Kits · auto-rules.`
            : '6 types: per-reservation, maintenance, welcome tray, owner, damage, transfer.'}
          accent="amber"
          badge={{ label: 'M.8', tone: 'gold' }}
        />
        <InvCard
          href="/beithady/inventory/transfers"
          icon={ArrowLeftRight}
          title="Transfers"
          description="Warehouse-to-warehouse moves. Out → In pair with in-transit visibility."
          accent="violet"
          badge={{ label: 'M.9', tone: 'gold' }}
        />
        <InvCard
          href="/beithady/inventory/counts"
          icon={ClipboardCheck}
          title="Counts & Adjustments"
          description="Cycle counts (weekly subset) · Physical counts (quarterly). Variance → adjustment with reason code."
          accent="cyan"
          badge={{ label: 'M.10', tone: 'gold' }}
        />
        <InvCard
          href="/beithady/inventory/rules/estimator"
          icon={ShoppingBag}
          title="Housekeeping Setup"
          description="Per-unit estimator matrix · 7 unit configurations · 30 consumables · Amazon EG sourced prices."
          accent="emerald"
          badge={{ label: 'M.15', tone: 'gold' }}
        />
      </section>

      {/* Cross-cutting quick links */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <QuickLink
          href="/beithady/inventory/approvals"
          icon={ShieldCheck}
          title="Approvals inbox"
          subtitle={totalApprovals > 0 ? `${totalApprovals} pending` : 'No pending items'}
          tone={totalApprovals > 0 ? 'amber' : 'neutral'}
        />
        <QuickLink
          href="/beithady/inventory/rules"
          icon={ScrollText}
          title="Consumption rules"
          subtitle="Auto-issue formulas (Phase L engine)"
          tone="neutral"
        />
        <QuickLink
          href="/beithady/inventory/m"
          icon={Smartphone}
          title="Mobile cleaner app"
          subtitle="Arabic · PIN-gated · for tablets"
          tone="neutral"
        />
      </section>

      <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Beit Hady — Inventory · Phase M (in progress)
      </footer>
    </BeithadyShell>
  );
}

function SnapStat({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone: 'red' | 'amber' | 'neutral';
}) {
  const cls = tone === 'red'
    ? 'text-rose-700 dark:text-rose-300'
    : tone === 'amber'
      ? 'text-amber-700 dark:text-amber-300'
      : 'text-slate-700 dark:text-slate-200';
  return (
    <div className="ix-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`text-lg font-bold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

function InvCard({
  href, icon: Icon, title, description, badge, accent,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description: string;
  badge?: { label: string; tone: 'navy' | 'gold' };
  accent: 'cyan' | 'amber' | 'violet' | 'emerald';
}) {
  const accentBg =
    accent === 'cyan' ? 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-200' :
    accent === 'amber' ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-200' :
    accent === 'violet' ? 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-200' :
    'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-200';
  const badgeBg = badge?.tone === 'navy'
    ? 'bg-[var(--bh-navy)] text-white'
    : 'bg-[var(--bh-gold)] text-[var(--bh-navy)]';
  return (
    <Link href={href} className="ix-card p-4 group hover:shadow-md hover:-translate-y-0.5 transition flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center justify-center w-10 h-10 rounded-lg ${accentBg}`}>
          <Icon size={18} />
        </span>
        {badge && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${badgeBg}`}>
            {badge.label}
          </span>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-1" style={{ color: 'var(--bh-navy)' }}>
          {title}
          <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition" />
        </h3>
        <p className="text-[11px] text-slate-500 mt-1 leading-snug">{description}</p>
      </div>
    </Link>
  );
}

function QuickLink({
  href, icon: Icon, title, subtitle, tone,
}: {
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  subtitle: string;
  tone: 'amber' | 'neutral';
}) {
  const subCls = tone === 'amber'
    ? 'text-amber-700 dark:text-amber-300 font-semibold'
    : 'text-slate-500';
  return (
    <Link href={href} className="ix-card p-3 flex items-center gap-3 hover:shadow-md transition">
      <Icon size={16} className="text-slate-400" />
      <div className="min-w-0">
        <div className="text-xs font-medium" style={{ color: 'var(--bh-navy)' }}>{title}</div>
        <div className={`text-[10px] ${subCls}`}>{subtitle}</div>
      </div>
      <ChevronRight size={14} className="ml-auto text-slate-300" />
    </Link>
  );
}
