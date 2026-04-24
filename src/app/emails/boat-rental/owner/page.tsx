import { Ship } from 'lucide-react';
import { TabPlaceholder } from '../_components/placeholder';
import { OWNER_TABS } from '../_components/tabs';

export const dynamic = 'force-dynamic';

export default function OwnerDashboard() {
  return (
    <>
      <header className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-cyan-50 text-cyan-600">
          <Ship size={24} strokeWidth={2.2} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">Owner Portal</p>
          <h1 className="text-3xl font-bold tracking-tight">My Boats</h1>
          <p className="text-sm text-slate-500 mt-1">
            Your fleet and upcoming bookings at a glance.
          </p>
        </div>
      </header>
      <TabPlaceholder
        title=""
        description=""
        tabs={OWNER_TABS}
        currentPath="/emails/boat-rental/owner"
        bullets={[
          'Tile per boat with next booking and month-to-date payouts',
          'Click a booking to see broker, client, trip, and payment details',
          'Mark a booking as paid manually when transfer lands',
          'Cancel bookings up to 72h before the booking date',
        ]}
      />
    </>
  );
}
