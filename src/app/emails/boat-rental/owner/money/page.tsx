import { Wallet } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getOwnedOwnerIds } from '@/lib/boat-rental/auth';
import { TabNav, OWNER_TABS } from '../../_components/tabs';
import { MoneySubNav } from './_components/sub-nav';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ from?: string; to?: string }>;

function defaultRange(): { from: string; to: string } {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const startOfMonth = new Date(Date.UTC(year, month, 1));
  const endOfMonth = new Date(Date.UTC(year, month + 1, 0));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return { from: fmt(startOfMonth), to: fmt(endOfMonth) };
}

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

export default async function MoneyOverview({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  const ownerIds = me ? await getOwnedOwnerIds(me) : [];
  const sb = supabaseAdmin();
  const fallback = defaultRange();
  const range = { from: sp.from || fallback.from, to: sp.to || fallback.to };

  const boatsRes = ownerIds.length
    ? await sb.from('boat_rental_boats').select('id, name').in('owner_id', ownerIds).order('name')
    : { data: [] as Array<{ id: string; name: string }> };
  const boats =
    ((boatsRes.data as unknown) as Array<{ id: string; name: string }> | null) ?? [];
  const boatIds = boats.map((b) => b.id);

  const [paymentsRes, expensesRes, openBillsCountRes] = await Promise.all([
    boatIds.length
      ? sb
          .from('boat_rental_payments')
          .select(
            `
            amount_egp, paid_at,
            reservation:boat_rental_reservations!inner ( boat_id )
          `
          )
          .in('reservation.boat_id', boatIds)
          .gte('paid_at', `${range.from}T00:00:00Z`)
          .lt('paid_at', `${range.to}T23:59:59Z`)
      : Promise.resolve({ data: [] as Array<{ amount_egp: string | number; reservation: { boat_id: string } }> }),
    boatIds.length
      ? sb
          .from('boat_rental_expenses')
          .select('amount_egp, category, boat_id, status')
          .in('boat_id', boatIds)
          .gte('expense_date', range.from)
          .lte('expense_date', range.to)
          .neq('status', 'cancelled')
      : Promise.resolve({ data: [] as Array<{ amount_egp: string | number; category: string; boat_id: string; status: string }> }),
    boatIds.length
      ? sb
          .from('boat_rental_expenses')
          .select('id', { count: 'exact', head: true })
          .in('boat_id', boatIds)
          .eq('status', 'open')
      : Promise.resolve({ count: 0 }),
  ]);

  const revenueByBoat = new Map<string, number>();
  for (const p of ((paymentsRes.data as unknown) as Array<{
    amount_egp: string | number;
    reservation: { boat_id: string };
  }> | null) ?? []) {
    revenueByBoat.set(
      p.reservation.boat_id,
      (revenueByBoat.get(p.reservation.boat_id) ?? 0) + Number(p.amount_egp)
    );
  }
  const expensesByBoat = new Map<string, number>();
  const expensesByCategory = new Map<string, number>();
  for (const e of ((expensesRes.data as unknown) as Array<{
    amount_egp: string | number;
    category: string;
    boat_id: string;
  }> | null) ?? []) {
    expensesByBoat.set(e.boat_id, (expensesByBoat.get(e.boat_id) ?? 0) + Number(e.amount_egp));
    expensesByCategory.set(
      e.category,
      (expensesByCategory.get(e.category) ?? 0) + Number(e.amount_egp)
    );
  }

  const totalRevenue = [...revenueByBoat.values()].reduce((s, v) => s + v, 0);
  const totalExpenses = [...expensesByBoat.values()].reduce((s, v) => s + v, 0);
  const openBillsCount = (openBillsCountRes as { count?: number | null }).count ?? 0;

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
      <MoneySubNav current="/emails/boat-rental/owner/money" />

      <form method="get" className="ix-card p-4 mb-6 flex gap-3 items-end flex-wrap">
        <label className="text-sm">
          <span className="text-slate-600 text-xs">From</span>
          <input name="from" type="date" defaultValue={range.from} className="ix-input mt-1" />
        </label>
        <label className="text-sm">
          <span className="text-slate-600 text-xs">To</span>
          <input name="to" type="date" defaultValue={range.to} className="ix-input mt-1" />
        </label>
        <button type="submit" className="ix-btn-secondary">
          Apply
        </button>
        {openBillsCount > 0 && (
          <span className="ml-auto text-xs text-amber-700 dark:text-amber-300">
            {openBillsCount} open bill{openBillsCount === 1 ? '' : 's'} ·{' '}
            <a href="/emails/boat-rental/owner/money/bills" className="underline">
              View
            </a>
          </span>
        )}
      </form>

      <section className="ix-card p-5 mb-4">
        <h2 className="font-semibold mb-3">
          Fleet P&amp;L · {range.from} → {range.to}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500 dark:text-slate-400 uppercase">
              <tr>
                <th className="text-left py-2">Boat</th>
                <th className="text-right">Revenue</th>
                <th className="text-right">Expenses</th>
                <th className="text-right">Net</th>
              </tr>
            </thead>
            <tbody>
              <tr className="font-semibold border-y border-slate-200 dark:border-slate-700">
                <td className="py-2">All boats</td>
                <td className="text-right tabular-nums">EGP {totalRevenue.toLocaleString()}</td>
                <td className="text-right tabular-nums">EGP {totalExpenses.toLocaleString()}</td>
                <td className="text-right tabular-nums">
                  EGP {(totalRevenue - totalExpenses).toLocaleString()}
                </td>
              </tr>
              {boats.map((b) => {
                const rev = revenueByBoat.get(b.id) ?? 0;
                const exp = expensesByBoat.get(b.id) ?? 0;
                return (
                  <tr key={b.id} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="py-2">{b.name}</td>
                    <td className="text-right tabular-nums">EGP {rev.toLocaleString()}</td>
                    <td className="text-right tabular-nums">EGP {exp.toLocaleString()}</td>
                    <td className="text-right tabular-nums">
                      EGP {(rev - exp).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="ix-card p-5">
        <h2 className="font-semibold mb-3">Expenses by category</h2>
        {expensesByCategory.size === 0 ? (
          <p className="text-xs text-slate-500">No expenses recorded in this period.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {[...expensesByCategory.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([cat, total]) => {
                const pct = totalExpenses > 0 ? (total / totalExpenses) * 100 : 0;
                const label = CATEGORY_LABELS[cat] ?? cat.replace(/_/g, ' ');
                return (
                  <li key={cat}>
                    <div className="flex justify-between mb-1">
                      <span>{label}</span>
                      <span className="tabular-nums">EGP {total.toLocaleString()}</span>
                    </div>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded h-2 overflow-hidden">
                      <div
                        className="h-full bg-cyan-500"
                        style={{ width: `${Math.min(100, pct).toFixed(1)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </section>
    </>
  );
}
