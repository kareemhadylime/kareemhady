import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, XCircle, Undo2 } from 'lucide-react';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getOwnedOwnerIds, hasBoatRole } from '@/lib/boat-rental/auth';
import { computeBalance } from '@/lib/boat-rental/payment-balance';
import { cairoTodayStr } from '@/lib/boat-rental/pricing';
import { TabNav, OWNER_TABS } from '../../../../_components/tabs';
import { MoneySubNav } from '../../_components/sub-nav';
import { ExpensePaymentForm } from '../../_components/expense-payment-form';
import { VoidExpenseForm } from '../../_components/void-expense-form';
import { AdminExpenseOverrides } from '../../_components/admin-expense-overrides';
import { AdminExpensePaymentActions } from '../../_components/admin-expense-payment-actions';

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

function statusPill(status: string) {
  const map: Record<string, string> = {
    open: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800',
    paid: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800',
    cancelled:
      'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  };
  return map[status] || 'bg-slate-50 text-slate-600 border-slate-200';
}

type PaymentRow = {
  id: string;
  amount_egp: string | number;
  paid_date: string;
  method: string;
  note: string | null;
  recorded_by: string | null;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Expense = any;

export default async function OwnerExpenseDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const me = await getCurrentUser();
  const ownerIds = me ? await getOwnedOwnerIds(me) : [];
  const isAdmin = me ? await hasBoatRole(me, 'admin') : false;
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('boat_rental_expenses')
    .select(
      `
      id, boat_id, owner_id, reservation_id, category, expense_date, amount_egp, description,
      fuel_liters, fuel_price_per_liter, fuel_tips_egp, vendor_name, status, receipt_path,
      created_at, updated_at,
      boat:boat_rental_boats ( id, name ),
      skipper:boat_rental_skippers ( id, name ),
      reservation:boat_rental_reservations ( id, booking_date ),
      payments:boat_rental_expense_payments ( id, amount_egp, paid_date, method, note, recorded_by )
    `
    )
    .eq('id', id)
    .maybeSingle();
  const e = data as Expense | null;
  if (!e) notFound();
  if (!isAdmin && !ownerIds.includes(e.owner_id)) notFound();

  const payments = ((e.payments ?? []) as PaymentRow[]).slice().sort(
    (a, b) => a.paid_date.localeCompare(b.paid_date)
  );
  const total = Number(e.amount_egp);
  const balance = computeBalance(
    total,
    payments.map((p) => p.amount_egp)
  );

  return (
    <>
      <header className="mb-2 flex items-center gap-2">
        <Link
          href="/emails/boat-rental/owner/money/expenses"
          className="text-slate-500 hover:text-slate-800 inline-flex items-center gap-1"
        >
          <ChevronLeft size={14} /> Expenses
        </Link>
      </header>
      <TabNav tabs={OWNER_TABS} currentPath="/emails/boat-rental/owner/money" />
      <MoneySubNav current="/emails/boat-rental/owner/money/expenses" />

      <section className="ix-card p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {CATEGORY_LABELS[e.category] ?? e.category} · {e.boat?.name ?? '—'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {e.expense_date}
              {e.vendor_name ? ` · Vendor: ${e.vendor_name}` : ''}
              {e.reservation?.booking_date ? ` · Trip: ${e.reservation.booking_date}` : ''}
              {e.skipper?.name ? ` · Skipper: ${e.skipper.name}` : ''}
            </p>
          </div>
          <span
            className={`text-[10px] uppercase tracking-wide font-semibold px-1.5 py-0.5 rounded border ${statusPill(
              e.status
            )}`}
          >
            {e.status}
          </span>
        </div>

        {e.category === 'fuel' && (e.fuel_liters || e.fuel_price_per_liter) && (
          <p className="mt-3 text-xs text-slate-500">
            {e.fuel_liters ?? '?'} L × EGP {e.fuel_price_per_liter ?? '?'} / L
            {e.fuel_tips_egp ? ` + tips EGP ${e.fuel_tips_egp}` : ''}
          </p>
        )}
        {e.description && (
          <p className="mt-3 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
            {e.description}
          </p>
        )}

        <div className="mt-6 grid grid-cols-3 gap-3 text-sm">
          <div>
            <div className="text-xs text-slate-500">Amount</div>
            <div className="font-medium tabular-nums">EGP {total.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Paid</div>
            <div className="font-medium tabular-nums">
              EGP {balance.total_paid.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Remaining</div>
            <div className="font-bold tabular-nums">
              EGP {balance.remaining.toLocaleString()}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <h2 className="font-semibold mb-2">Payments</h2>
          {payments.length === 0 ? (
            <p className="text-xs text-slate-500 mb-3">No payments yet.</p>
          ) : (
            <ul className="text-sm divide-y divide-slate-100 border-y border-slate-100 mb-3">
              {payments.map((p) => (
                <li key={p.id} className="py-2 flex justify-between items-start gap-3">
                  <div>
                    <div>
                      {p.paid_date} ·{' '}
                      <span className="text-slate-500">{p.method.replace(/_/g, ' ')}</span>
                    </div>
                    {p.note && <div className="text-xs text-slate-500 mt-0.5">{p.note}</div>}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums font-medium">
                      EGP {Number(p.amount_egp).toLocaleString()}
                    </span>
                    {isAdmin && (
                      <AdminExpensePaymentActions
                        paymentId={p.id}
                        amountEgp={Number(p.amount_egp)}
                        paidDate={p.paid_date}
                        method={p.method}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {e.status === 'open' && balance.remaining > 0 && (
            <ExpensePaymentForm
              expenseId={e.id}
              remaining={balance.remaining}
              todayCairo={cairoTodayStr()}
            />
          )}
        </div>
      </section>

      {(e.status === 'open' || e.status === 'paid') && (
        <section className="mt-6 ix-card p-5 border-rose-200 bg-rose-50/20 dark:border-rose-800 dark:bg-rose-950/20">
          <h2 className="font-semibold mb-2 text-rose-800 dark:text-rose-300 text-sm flex items-center gap-2">
            {e.status === 'paid' ? (
              <>
                <Undo2 size={14} /> Undo recent entry
              </>
            ) : (
              <>
                <XCircle size={14} /> Cancel this bill
              </>
            )}
          </h2>
          <p className="text-xs text-rose-900/70 dark:text-rose-200/70 mb-3">
            {e.status === 'paid' ? (
              <>
                For fat-finger corrections only. Within 10 minutes of entry you can void this
                expense — its payment rows are deleted so the entry leaves no trace beyond the audit
                log. After 10 minutes, paid expenses are locked and you have to record a reversing
                entry.
              </>
            ) : (
              <>
                Cancelling marks the bill as voided. Existing payments stay on record but are no
                longer counted as outflows.
              </>
            )}
          </p>
          <VoidExpenseForm
            expenseId={e.id}
            status={e.status as 'open' | 'paid' | 'cancelled'}
            createdAtIso={e.created_at}
          />
        </section>
      )}

      {isAdmin && (
        <AdminExpenseOverrides
          expenseId={e.id}
          initial={{
            category: e.category,
            amount_egp: Number(e.amount_egp),
            expense_date: e.expense_date,
            description: e.description ?? null,
            vendor_name: e.vendor_name ?? null,
            status: e.status as 'open' | 'paid' | 'cancelled',
          }}
        />
      )}
    </>
  );
}
