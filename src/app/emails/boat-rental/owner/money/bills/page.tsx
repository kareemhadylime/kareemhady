import Link from 'next/link';
import { Wallet, AlertTriangle } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getOwnedOwnerIds } from '@/lib/boat-rental/auth';
import { computeBalance } from '@/lib/boat-rental/payment-balance';
import { cairoTodayStr } from '@/lib/boat-rental/pricing';
import { TabNav, OWNER_TABS } from '../../../_components/tabs';
import { MoneySubNav } from '../_components/sub-nav';
import { ExpensePaymentForm } from '../_components/expense-payment-form';

export const dynamic = 'force-dynamic';

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

const OVERDUE_DAYS = 7;

type BillRow = {
  id: string;
  expense_date: string;
  category: string;
  amount_egp: string | number;
  vendor_name: string | null;
  description: string | null;
  boat: { id: string; name: string } | null;
  payments: Array<{ amount_egp: string | number }>;
};

function daysBetween(fromIso: string, toIso: string): number {
  const ms = Date.parse(toIso) - Date.parse(fromIso);
  return Math.floor(ms / 86_400_000);
}

export default async function OwnerBillsPage() {
  const me = await getCurrentUser();
  const ownerIds = me ? await getOwnedOwnerIds(me) : [];
  const sb = supabaseAdmin();

  const today = cairoTodayStr();

  const boatsRes = ownerIds.length
    ? await sb.from('boat_rental_boats').select('id').in('owner_id', ownerIds)
    : { data: [] as Array<{ id: string }> };
  const boatIds = ((boatsRes.data as Array<{ id: string }> | null) || []).map((b) => b.id);

  let rows: BillRow[] = [];
  if (boatIds.length) {
    const { data } = await sb
      .from('boat_rental_expenses')
      .select(
        `
        id, expense_date, category, amount_egp, vendor_name, description,
        boat:boat_rental_boats ( id, name ),
        payments:boat_rental_expense_payments ( amount_egp )
      `
      )
      .in('boat_id', boatIds)
      .eq('status', 'open')
      .order('expense_date', { ascending: true });
    rows = ((data as unknown) as BillRow[] | null) ?? [];
  }

  const enriched = rows.map((r) => {
    const total = Number(r.amount_egp);
    const balance = computeBalance(total, (r.payments ?? []).map((p) => p.amount_egp));
    const overdueDays = daysBetween(r.expense_date, today);
    return { ...r, balance, total, overdueDays };
  });

  const totalOwing = enriched.reduce((s, r) => s + r.balance.remaining, 0);
  const overdueCount = enriched.filter((r) => r.overdueDays > OVERDUE_DAYS).length;

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
      <MoneySubNav current="/emails/boat-rental/owner/money/bills" />

      <section className="ix-card p-5 mb-4">
        <div className="flex items-baseline justify-between flex-wrap gap-2">
          <div>
            <h2 className="font-semibold">Open bills</h2>
            <p className="text-xs text-slate-500 mt-1">
              Sorted oldest first.{' '}
              {overdueCount > 0 && (
                <span className="text-amber-700 dark:text-amber-300 inline-flex items-center gap-1">
                  <AlertTriangle size={11} /> {overdueCount} bill
                  {overdueCount === 1 ? '' : 's'} over {OVERDUE_DAYS} days old.
                </span>
              )}
            </p>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">Total owing</div>
            <div className="text-2xl font-bold tabular-nums">EGP {totalOwing.toLocaleString()}</div>
          </div>
        </div>
      </section>

      <section className="space-y-3">
        {enriched.length === 0 ? (
          <div className="ix-card p-6 text-center text-sm text-slate-500">
            🎉 You&apos;re all paid up — no open bills.
          </div>
        ) : (
          enriched.map((r) => {
            const overdue = r.overdueDays > OVERDUE_DAYS;
            return (
              <div
                key={r.id}
                className={`ix-card p-4 ${
                  overdue ? 'border-amber-300 dark:border-amber-700 bg-amber-50/30 dark:bg-amber-950/20' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-[200px]">
                    <div className="text-xs text-slate-500">
                      {r.expense_date} · {r.boat?.name ?? '—'} · {r.overdueDays}d old
                      {overdue && (
                        <span className="ml-1 text-amber-700 dark:text-amber-300 font-medium">
                          (overdue)
                        </span>
                      )}
                    </div>
                    <Link
                      href={`/emails/boat-rental/owner/money/expenses/${r.id}`}
                      className="font-semibold text-cyan-700 hover:underline"
                    >
                      {CATEGORY_LABELS[r.category] ?? r.category}
                      {r.vendor_name ? ` · ${r.vendor_name}` : ''}
                    </Link>
                    {r.description && (
                      <p className="text-xs text-slate-500 mt-0.5 max-w-md truncate">
                        {r.description}
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500">Remaining</div>
                    <div className="font-bold tabular-nums">
                      EGP {r.balance.remaining.toLocaleString()}
                      <span className="text-xs text-slate-500 font-normal">
                        {' '}
                        / {r.total.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 border-t border-slate-100 dark:border-slate-800 pt-3">
                  <ExpensePaymentForm
                    expenseId={r.id}
                    remaining={r.balance.remaining}
                    todayCairo={today}
                    compact
                  />
                </div>
              </div>
            );
          })
        )}
      </section>
    </>
  );
}
