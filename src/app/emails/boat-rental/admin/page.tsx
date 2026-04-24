import { Ship } from 'lucide-react';
import { TabNav, ADMIN_TABS } from '../_components/tabs';

export const dynamic = 'force-dynamic';

export default async function BoatRentalAdminDashboard() {
  return (
    <>
      <header className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-cyan-50 text-cyan-600">
          <Ship size={24} strokeWidth={2.2} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            Personal · Boat Rental
          </p>
          <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage boats, pricing, seasons, destinations, and users.
          </p>
        </div>
      </header>

      <TabNav tabs={ADMIN_TABS} currentPath="/emails/boat-rental/admin" />

      <section className="mt-8 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <StatCard label="Active boats" value="—" hint="Connect data after migration 0016 applied" />
        <StatCard label="Today's trips" value="—" hint="Pending" />
        <StatCard label="Pending payments" value="—" hint="Pending" />
      </section>

      <section className="mt-8 ix-card p-6 bg-cyan-50/40 border-cyan-200">
        <h2 className="font-semibold text-cyan-900">Setup checklist</h2>
        <ol className="mt-3 space-y-2 text-sm text-cyan-900/80 list-decimal list-inside">
          <li>Apply migration <code>supabase/migrations/0016_boat_rental.sql</code> in the Supabase SQL editor.</li>
          <li>Create Supabase Storage bucket <code>boat-rental</code> (private) in Dashboard → Storage.</li>
          <li>Configure Green-API credentials in <a className="underline" href="/admin/integrations">Admin → Integrations</a>.</li>
          <li>Assign brokers and owners from the Users tab once the migration is live.</li>
        </ol>
      </section>
    </>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="ix-card p-5">
      <div className="text-[10px] uppercase tracking-wide text-slate-500 font-medium">{label}</div>
      <div className="text-3xl font-bold tabular-nums mt-1">{value}</div>
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
    </div>
  );
}
