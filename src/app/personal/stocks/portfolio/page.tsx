import {
  getTopHoldings,
  getAllOverrides,
  getAccountsList,
  getInstrumentsList,
} from '@/lib/personal/stocks/queries';
import { HoldingsTable } from '../_components/holdings-table';
import { OverridesManager } from '../_components/overrides-manager';

export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  const [rows, overrides, accounts, instruments] = await Promise.all([
    getTopHoldings(),
    getAllOverrides(),
    getAccountsList(),
    getInstrumentsList(),
  ]);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Open positions</h2>
        <p className="text-[11px] text-slate-500 mt-0.5">
          Rows tagged{' '}
          <span className="text-[9px] font-bold uppercase px-1 py-0.5 rounded bg-amber-100 text-amber-800">
            Override
          </span>{' '}
          have manual qty + avg cost (broker-authoritative). Untagged rows are computed from buy/sell trades.
        </p>
      </div>
      <HoldingsTable rows={rows} />
      <OverridesManager
        overrides={overrides}
        accounts={accounts}
        instruments={instruments}
      />
    </div>
  );
}
