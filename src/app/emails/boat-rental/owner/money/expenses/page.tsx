import Link from 'next/link';
import { Wallet, Plus, Receipt } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getOwnedOwnerIds } from '@/lib/boat-rental/auth';
import { TabNav, OWNER_TABS } from '../../../_components/tabs';
import { MoneySubNav } from '../_components/sub-nav';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

const CATEGORY_LABELS: Record<string, string> = {
  amenities: 'Amenities',
  part_time_skipper: 'Part-time skipper',
  marina_docking: 'Marina docking',
  fuel: 'Fuel',
  repair: 'Repair',
  insurance: 'Insurance',
  boat_license: 'Boat license',
  full_time_skipper_salary: 'Full-time skipper salary',
  maintenance_contract: 'Maintenance contract',
  other: 'Other',
};

function statusPill(status: string) {
  const map: Record<string, string> = {
    open: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
    paid: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
    cancelled:
      'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  };
  return map[status] || 'bg-slate-50 text-slate-600 border-slate-200';
}

type SearchParams = Promise<{
  boat?: string;
  category?: string;
  status?: string;
  from?: string;
  to?: string;
  page?: string;
}>;

type ExpenseRow = {
  id: string;
  expense_date: string;
  category: string;
  amount_egp: string | number;
  status: string;
  receipt_path: string | null;
  vendor_name: string | null;
  description: string | null;
  boat_id: string;
  boat: { name: string } | null;
};

export default async function OwnerExpensesList({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  const ownerIds = me ? await getOwnedOwnerIds(me) : [];
  const sb = supabaseAdmin();
  const page = Math.max(1, parseInt(sp.page ?? '1', 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const boatsRes = ownerIds.length
    ? await sb.from('boat_rental_boats').select('id, name').in('owner_id', ownerIds).order('name')
    : { data: [] as Array<{ id: string; name: string }> };
  const boats =
    ((boatsRes.data as unknown) as Array<{ id: string; name: string }> | null) ?? [];
  const boatIds = boats.map((b) => b.id);

  let rows: ExpenseRow[] = [];
  let totalCount = 0;
  if (boatIds.length) {
    let q = sb
      .from('boat_rental_expenses')
      .select(
        `
        id, expense_date, category, amount_egp, status, receipt_path, vendor_name, description,
        boat_id, boat:boat_rental_boats ( name )
      `,
        { count: 'exact' }
      )
      .in('boat_id', boatIds)
      .order('expense_date', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    if (sp.boat) q = q.eq('boat_id', sp.boat);
    if (sp.category) q = q.eq('category', sp.category);
    if (sp.status) q = q.eq('status', sp.status);
    if (sp.from) q = q.gte('expense_date', sp.from);
    if (sp.to) q = q.lte('expense_date', sp.to);
    const { data, count } = await q;
    rows = ((data as unknown) as ExpenseRow[] | null) ?? [];
    totalCount = count ?? rows.length;
  }

  const lastPage = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <>
      <header className="flex items-start gap-4 mb-2">
        <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-cyan-50 dark:bg-cyan-950 text-cyan-600 dark:text-cyan-300">
          <Wallet size={24} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 font-medium">
            Owner Portal
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Money</h1>
        </div>
      </header>
      <TabNav tabs={OWNER_TABS} currentPath="/emails/boat-rental/owner/money" />
      <MoneySubNav current="/emails/boat-rental/owner/money/expenses" />

      <div className="flex justify-end mb-4">
        <Link
          href="/emails/boat-rental/owner/money/expenses/new"
          className="ix-btn-primary inline-flex items-center gap-1"
        >
          <Plus size={14} /> New expense
        </Link>
      </div>

      <form
        method="get"
        className="ix-card p-4 mb-6 grid grid-cols-2 md:grid-cols-6 gap-3 items-end"
      >
        <label className="text-sm">
          <span className="text-slate-600 text-xs">Boat</span>
          <select name="boat" defaultValue={sp.boat ?? ''} className="ix-input mt-1">
            <option value="">All</option>
            {boats.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-slate-600 text-xs">Category</span>
          <select name="category" defaultValue={sp.category ?? ''} className="ix-input mt-1">
            <option value="">All</option>
            {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="text-slate-600 text-xs">Status</span>
          <select name="status" defaultValue={sp.status ?? ''} className="ix-input mt-1">
            <option value="">All</option>
            <option value="open">Open</option>
            <option value="paid">Paid</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="text-slate-600 text-xs">From</span>
          <input
            name="from"
            type="date"
            defaultValue={sp.from ?? ''}
            className="ix-input mt-1"
          />
        </label>
        <label className="text-sm">
          <span className="text-slate-600 text-xs">To</span>
          <input name="to" type="date" defaultValue={sp.to ?? ''} className="ix-input mt-1" />
        </label>
        <button type="submit" className="ix-btn-secondary">
          Filter
        </button>
      </form>

      <section className="ix-card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase bg-slate-50 dark:bg-slate-900/40">
              <tr>
                <th className="text-left px-3 py-2">Date</th>
                <th className="text-left px-3 py-2">Boat</th>
                <th className="text-left px-3 py-2">Category</th>
                <th className="text-left px-3 py-2">Notes</th>
                <th className="text-right px-3 py-2">Amount</th>
                <th className="text-left px-3 py-2">Status</th>
                <th className="text-center px-3 py-2">Receipt</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500 text-xs">
                    No expenses match these filters.
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/40"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/emails/boat-rental/owner/money/expenses/${r.id}`}
                        className="text-cyan-700 hover:underline"
                      >
                        {r.expense_date}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{r.boat?.name ?? '—'}</td>
                    <td className="px-3 py-2">
                      {CATEGORY_LABELS[r.category] ?? r.category.replace(/_/g, ' ')}
                    </td>
                    <td className="px-3 py-2 max-w-[280px] truncate">
                      {r.vendor_name ? (
                        <span className="text-slate-500">{r.vendor_name}</span>
                      ) : null}
                      {r.vendor_name && r.description ? <span className="px-1">·</span> : null}
                      {r.description ?? (r.vendor_name ? '' : '—')}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      EGP {Number(r.amount_egp).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${statusPill(r.status)}`}
                      >
                        {r.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.receipt_path ? <Receipt size={14} className="inline text-slate-400" /> : ''}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {lastPage > 1 && (
        <nav className="mt-4 flex justify-end gap-2 text-sm">
          {Array.from({ length: lastPage }, (_, i) => i + 1).slice(0, 10).map((n) => {
            const params = new URLSearchParams(sp as Record<string, string>);
            params.set('page', String(n));
            return (
              <Link
                key={n}
                href={`?${params.toString()}`}
                className={`px-3 py-1 rounded border ${
                  n === page
                    ? 'bg-cyan-600 text-white border-cyan-600'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                }`}
              >
                {n}
              </Link>
            );
          })}
        </nav>
      )}
    </>
  );
}
