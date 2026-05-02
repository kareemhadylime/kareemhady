import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import { getCurrentUser } from '@/lib/auth';
import { getOwnedOwnerIds } from '@/lib/boat-rental/auth';
import { cairoTodayStr } from '@/lib/boat-rental/pricing';
import { TabNav, OWNER_TABS } from '../../../../_components/tabs';
import { MoneySubNav } from '../../_components/sub-nav';
import { ExpenseForm } from '../../_components/expense-form';

export const dynamic = 'force-dynamic';

type SearchParams = Promise<{ boat_id?: string }>;

export default async function NewExpensePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const me = await getCurrentUser();
  const ownerIds = me ? await getOwnedOwnerIds(me) : [];
  const sb = supabaseAdmin();

  const boatsRes = ownerIds.length
    ? await sb.from('boat_rental_boats').select('id, name').in('owner_id', ownerIds).order('name')
    : { data: [] as Array<{ id: string; name: string }> };
  const boats =
    ((boatsRes.data as unknown) as Array<{ id: string; name: string }> | null) ?? [];
  const boatIds = boats.map((b) => b.id);

  const [skippersRes, reservationsRes, settingsRes] = await Promise.all([
    boatIds.length
      ? sb
          .from('boat_rental_skippers')
          .select('id, name, boat_id')
          .in('boat_id', boatIds)
          .eq('active', true)
          .order('name')
      : Promise.resolve({ data: [] as Array<{ id: string; name: string; boat_id: string }> }),
    boatIds.length
      ? sb
          .from('boat_rental_reservations')
          .select('id, booking_date, boat_id, status')
          .in('boat_id', boatIds)
          .in('status', ['confirmed', 'details_filled', 'paid_to_owner'])
          .order('booking_date', { ascending: false })
          .limit(200)
      : Promise.resolve({ data: [] as Array<{ id: string; booking_date: string; boat_id: string; status: string }> }),
    ownerIds.length
      ? sb
          .from('boat_rental_owner_settings')
          .select('default_fuel_price_per_l, preferred_marina_vendor')
          .in('owner_id', ownerIds)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const skippers =
    ((skippersRes.data as unknown) as Array<{ id: string; name: string; boat_id: string }> | null) ??
    [];
  const reservations =
    ((reservationsRes.data as unknown) as Array<{
      id: string;
      booking_date: string;
      boat_id: string;
    }> | null) ?? [];
  const settings = (settingsRes as { data: { default_fuel_price_per_l: number | null; preferred_marina_vendor: string | null } | null }).data;

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

      <section className="ix-card p-6 max-w-2xl">
        <h1 className="text-xl font-bold tracking-tight mb-4">New expense</h1>
        {boats.length === 0 ? (
          <p className="text-sm text-slate-500">
            You have no boats yet — add a boat first to record expenses.
          </p>
        ) : (
          <ExpenseForm
            boats={boats}
            skippers={skippers}
            reservations={reservations}
            settings={settings}
            defaultBoatId={sp.boat_id}
            todayCairo={cairoTodayStr()}
          />
        )}
      </section>
    </>
  );
}
