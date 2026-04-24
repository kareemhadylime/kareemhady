import { Ship } from 'lucide-react';
import { TabPlaceholder } from '../_components/placeholder';
import { BROKER_TABS } from '../_components/tabs';

export const dynamic = 'force-dynamic';

export default function BrokerDashboard() {
  return (
    <>
      <header className="flex items-start gap-4 mb-6">
        <div className="w-12 h-12 rounded-xl inline-flex items-center justify-center bg-cyan-50 text-cyan-600">
          <Ship size={24} strokeWidth={2.2} />
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-500 font-medium">Broker Portal</p>
          <h1 className="text-3xl font-bold tracking-tight">My Bookings</h1>
          <p className="text-sm text-slate-500 mt-1">
            Your upcoming trips and recent history.
          </p>
        </div>
      </header>
      <TabPlaceholder
        title=""
        description=""
        tabs={BROKER_TABS}
        currentPath="/emails/boat-rental/broker"
        bullets={[
          'Upcoming bookings (confirmed · details_filled)',
          'Active 2-hour holds with countdown',
          'Past bookings (paid_to_owner · cancelled)',
          'One-click WhatsApp to client/owner from any booking card',
        ]}
      />
    </>
  );
}
