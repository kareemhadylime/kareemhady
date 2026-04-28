import Link from 'next/link';
import {
  PackagePlus, PackageMinus, ClipboardCheck, ShoppingBag, ChevronRight, AlertCircle,
} from 'lucide-react';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { BeithadyShell, BeithadyHeader } from '../../_components/beithady-shell';
import { supabaseAdmin } from '@/lib/supabase';
import { GRN_STATUS_LABEL } from '@/lib/beithady/inventory/grn';
import { ISSUE_STATUS_LABEL, ISSUE_TYPE_LABEL } from '@/lib/beithady/inventory/issue';
import { COUNT_STATUS_LABEL } from '@/lib/beithady/inventory/counts';

export const dynamic = 'force-dynamic';

type AllowedRole = 'admin' | 'manager' | 'ops' | 'warehouse_manager' | 'finance';

type RawIssueLocal = {
  id: string; issue_no: string; status: string; type: string; sub_total_egp: number;
  created_at: string; created_via: string; cleaner_session_name: string | null;
  warehouse: Array<{ code: string; name_en: string }> | { code: string; name_en: string };
};

export default async function ApprovalsInboxPage() {
  const { roles } = await requireBeithadyPermission('inventory', 'read');
  const sb = supabaseAdmin();

  const [grns, issues, pos, counts] = await Promise.all([
    sb.from('beithady_inventory_grns')
      .select('id, grn_no, status, sub_total_egp, created_at, vendor:beithady_inventory_vendors!inner(legal_name, trade_name), warehouse:beithady_inventory_warehouses!inner(code, name_en)')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: true })
      .limit(50),
    sb.from('beithady_inventory_issues')
      .select('id, issue_no, status, type, sub_total_egp, created_at, created_via, cleaner_session_name, warehouse:beithady_inventory_warehouses!inner(code, name_en)')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: true })
      .limit(50),
    sb.from('beithady_inventory_purchase_orders')
      .select('id, po_no, status, sub_total_egp, created_at, vendor:beithady_inventory_vendors!inner(legal_name, trade_name)')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: true })
      .limit(50),
    sb.from('beithady_inventory_count_sessions')
      .select('id, session_no, status, type, variance_total_egp, created_at, warehouse:beithady_inventory_warehouses!inner(code, name_en)')
      .eq('status', 'pending_approval')
      .order('created_at', { ascending: true })
      .limit(50),
  ]);

  const { data: cleanerSubmitted } = await sb
    .from('beithady_inventory_issues')
    .select('id, issue_no, status, type, sub_total_egp, created_at, created_via, cleaner_session_name, warehouse:beithady_inventory_warehouses!inner(code, name_en)')
    .eq('status', 'submitted')
    .in('created_via', ['mobile_pin', 'wa_inbound'])
    .order('created_at', { ascending: true })
    .limit(30);

  type RawGrn = { id: string; grn_no: string; status: string; sub_total_egp: number; created_at: string; vendor: Array<{ legal_name: string; trade_name: string | null }> | { legal_name: string; trade_name: string | null }; warehouse: Array<{ code: string; name_en: string }> | { code: string; name_en: string } };
  type RawPo = { id: string; po_no: string; status: string; sub_total_egp: number; created_at: string; vendor: Array<{ legal_name: string; trade_name: string | null }> | { legal_name: string; trade_name: string | null } };
  type RawCount = { id: string; session_no: string; status: string; type: string; variance_total_egp: number; created_at: string; warehouse: Array<{ code: string; name_en: string }> | { code: string; name_en: string } };

  const norm = <T,>(v: T | T[]): T => (Array.isArray(v) ? v[0] : v);

  const grnList = ((grns.data as unknown) as RawGrn[] | null) || [];
  const issueList = ((issues.data as unknown) as RawIssueLocal[] | null) || [];
  const cleanerList = ((cleanerSubmitted as unknown) as RawIssueLocal[] | null) || [];
  const poList = ((pos.data as unknown) as RawPo[] | null) || [];
  const countList = ((counts.data as unknown) as RawCount[] | null) || [];

  const totalPending = grnList.length + issueList.length + cleanerList.length + poList.length + countList.length;
  const canApproveAsManager = roles.some(r => ['admin', 'manager', 'warehouse_manager'].includes(r));
  const canApproveAsFinance = roles.some(r => ['admin', 'finance'].includes(r));

  return (
    <BeithadyShell
      breadcrumbs={[
        { label: 'Inventory', href: '/beithady/inventory' },
        { label: 'Approvals' },
      ]}
      containerClass="max-w-6xl"
    >
      <BeithadyHeader
        eyebrow="Beit Hady · Inventory · Approvals"
        title="Approvals inbox"
        subtitle={`${totalPending} item${totalPending === 1 ? '' : 's'} awaiting decision. Per the configurable approval matrix (warehouse_manager + finance + manager). Mobile + WhatsApp submissions surface here too.`}
      />

      {totalPending === 0 && (
        <section className="ix-card border-emerald-200 bg-emerald-50 p-6 text-center">
          <ClipboardCheck size={32} className="mx-auto text-emerald-500 mb-2" />
          <h2 className="text-base font-semibold text-emerald-900">Inbox zero</h2>
          <p className="text-xs text-emerald-700 mt-1">Nothing awaiting your approval. Drafts and submissions will appear here as they come in.</p>
        </section>
      )}

      {grnList.length > 0 && (
        <Section title="GRNs awaiting approval" icon={PackagePlus} count={grnList.length} canApprove={canApproveAsManager || canApproveAsFinance}>
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-3 py-2">GRN #</th>
                <th className="text-left px-3 py-2">Vendor</th>
                <th className="text-left px-3 py-2">Warehouse</th>
                <th className="text-right px-3 py-2">Sub-total (EGP)</th>
                <th className="text-left px-3 py-2">Submitted</th>
                <th className="text-right px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {grnList.map(g => {
                const vendor = norm(g.vendor);
                const wh = norm(g.warehouse);
                return (
                  <tr key={g.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-[11px]">
                      <Link href={`/beithady/inventory/grn/${g.id}`} className="hover:text-cyan-700 hover:underline">{g.grn_no}</Link>
                    </td>
                    <td className="px-3 py-2">{vendor.trade_name || vendor.legal_name}</td>
                    <td className="px-3 py-2 text-[11px]">{wh.code}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(g.sub_total_egp).toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                    <td className="px-3 py-2 text-[10px] text-slate-500">{age(g.created_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/beithady/inventory/grn/${g.id}`} className="text-cyan-700 hover:underline text-[11px] inline-flex items-center gap-0.5">Review <ChevronRight size={12} /></Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      {issueList.length > 0 && (
        <Section title="Issues awaiting approval" icon={PackageMinus} count={issueList.length} canApprove={canApproveAsManager || canApproveAsFinance}>
          {renderIssuesTable(issueList, norm)}
        </Section>
      )}

      {cleanerList.length > 0 && (
        <Section title="Cleaner submissions (mobile + WhatsApp)" icon={PackageMinus} count={cleanerList.length} canApprove={canApproveAsManager}>
          <p className="text-[10px] text-slate-500 px-3 py-2 bg-amber-50 border-b border-amber-100">
            <AlertCircle size={10} className="inline mr-1" />
            Submissions from /inventory/m mobile app or WhatsApp inbound (#reorder). Manager review required before posting.
          </p>
          {renderIssuesTable(cleanerList, norm)}
        </Section>
      )}

      {poList.length > 0 && (
        <Section title="POs awaiting approval" icon={ShoppingBag} count={poList.length} canApprove={canApproveAsFinance}>
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-3 py-2">PO #</th>
                <th className="text-left px-3 py-2">Vendor</th>
                <th className="text-right px-3 py-2">Sub-total (EGP)</th>
                <th className="text-left px-3 py-2">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {poList.map(p => {
                const vendor = norm(p.vendor);
                return (
                  <tr key={p.id} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-mono text-[11px]">{p.po_no}</td>
                    <td className="px-3 py-2">{vendor.trade_name || vendor.legal_name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(p.sub_total_egp).toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                    <td className="px-3 py-2 text-[10px] text-slate-500">{age(p.created_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      {countList.length > 0 && (
        <Section title="Count sessions awaiting approval" icon={ClipboardCheck} count={countList.length} canApprove={canApproveAsManager}>
          <table className="w-full text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="text-left px-3 py-2">Session #</th>
                <th className="text-left px-3 py-2">Warehouse</th>
                <th className="text-left px-3 py-2">Type</th>
                <th className="text-right px-3 py-2">Variance (EGP)</th>
                <th className="text-left px-3 py-2">Submitted</th>
                <th className="text-right px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {countList.map(c => {
                const wh = norm(c.warehouse);
                return (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono text-[11px]">
                      <Link href={`/beithady/inventory/counts/${c.id}`} className="hover:text-cyan-700 hover:underline">{c.session_no}</Link>
                    </td>
                    <td className="px-3 py-2 text-[11px]">{wh.code}</td>
                    <td className="px-3 py-2 capitalize text-[11px]">{c.type}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{Number(c.variance_total_egp).toLocaleString('en-US', { maximumFractionDigits: 0 })}</td>
                    <td className="px-3 py-2 text-[10px] text-slate-500">{age(c.created_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/beithady/inventory/counts/${c.id}`} className="text-cyan-700 hover:underline text-[11px] inline-flex items-center gap-0.5">Review <ChevronRight size={12} /></Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Section>
      )}

      <p className="text-[10px] text-slate-300 text-center">
        Workflow states: GRN {Object.values(GRN_STATUS_LABEL).map(s => s.en).join(' · ')} · Issue {Object.values(ISSUE_STATUS_LABEL).map(s => s.en).join(' · ')} · Count {Object.values(COUNT_STATUS_LABEL).map(s => s.en).join(' · ')}
      </p>

      <footer className="text-[11px] text-slate-400 text-center border-t border-slate-200 dark:border-slate-700 pt-4">
        Beit Hady — Inventory · Approvals inbox · Phase M.14 · Acting roles: {(roles as string[]).filter(r => ['admin', 'manager', 'warehouse_manager', 'finance'].includes(r as AllowedRole)).join(', ') || 'read-only'}
      </footer>
    </BeithadyShell>
  );
}

function renderIssuesTable(rows: RawIssueLocal[], norm: <T,>(v: T | T[]) => T) {
  return (
    <table className="w-full text-xs">
      <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
        <tr>
          <th className="text-left px-3 py-2">Issue #</th>
          <th className="text-left px-3 py-2">Type</th>
          <th className="text-left px-3 py-2">Warehouse</th>
          <th className="text-left px-3 py-2">Source</th>
          <th className="text-right px-3 py-2">Sub-total (EGP)</th>
          <th className="text-left px-3 py-2">Submitted</th>
          <th className="text-right px-3 py-2"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(i => {
          const wh = norm(i.warehouse);
          const typeMeta = ISSUE_TYPE_LABEL[i.type as keyof typeof ISSUE_TYPE_LABEL];
          return (
            <tr key={i.id} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-2 font-mono text-[11px]">
                <Link href={`/beithady/inventory/issue/${i.id}`} className="hover:text-cyan-700 hover:underline">{i.issue_no}</Link>
              </td>
              <td className="px-3 py-2">
                {typeMeta && <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${typeMeta.tone}`}>{typeMeta.en}</span>}
              </td>
              <td className="px-3 py-2 text-[11px]">{wh.code}</td>
              <td className="px-3 py-2 text-[10px] text-slate-500">
                {i.created_via}
                {i.cleaner_session_name && <div className="text-[10px] text-slate-400">{i.cleaner_session_name}</div>}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {Number(i.sub_total_egp) > 0 ? Number(i.sub_total_egp).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'}
              </td>
              <td className="px-3 py-2 text-[10px] text-slate-500">{age(i.created_at)}</td>
              <td className="px-3 py-2 text-right">
                <Link href={`/beithady/inventory/issue/${i.id}`} className="text-cyan-700 hover:underline text-[11px] inline-flex items-center gap-0.5">Review <ChevronRight size={12} /></Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Section({
  title, icon: Icon, count, canApprove, children,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  count: number;
  canApprove: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="text-xs uppercase tracking-wide font-semibold inline-flex items-center gap-1.5">
        <Icon size={12} className="text-amber-600" />
        {title} <span className="text-slate-400 font-normal">({count})</span>
        {!canApprove && <span className="text-[9px] text-slate-400 italic ml-2">your role can&apos;t approve these</span>}
      </h2>
      <div className="ix-card overflow-hidden">{children}</div>
    </section>
  );
}

function age(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
