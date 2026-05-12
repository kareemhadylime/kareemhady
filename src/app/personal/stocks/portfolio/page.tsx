import { getTopHoldings } from '@/lib/personal/stocks/queries';
import { HoldingsTable } from '../_components/holdings-table';

export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  const rows = await getTopHoldings(); // no limit → all rows
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Open positions</h2>
      <HoldingsTable rows={rows} />
    </div>
  );
}
