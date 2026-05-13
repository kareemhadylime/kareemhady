import type { LedgerRow } from '@/lib/beithady/financials/ledgers';

export function PartnerLedgerTable({ rows }: { rows: LedgerRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b font-semibold text-slate-700">
            <td className="py-1 pr-3">Partner</td>
            <td className="text-right pr-3">Opening</td>
            <td className="text-right pr-3">Deltas YTD</td>
            <td className="text-right pr-3">Current balance</td>
            <td className="text-right">Last move</td>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-b ${r.is_synthetic ? 'bg-red-50' : ''}`}>
              <td className="py-1 pr-3">
                {r.is_synthetic ? (
                  <span className="text-red-700 font-semibold mr-1">⚠</span>
                ) : null}
                {r.partner_name_raw}
              </td>
              <td className="text-right pr-3">
                {Math.round(r.opening_balance).toLocaleString('en-US')}
              </td>
              <td
                className={`text-right pr-3 ${r.delta < 0 ? 'text-red-700' : r.delta > 0 ? 'text-green-700' : ''}`}
              >
                {Math.round(r.delta).toLocaleString('en-US')}
              </td>
              <td className="text-right pr-3 font-semibold">
                {Math.round(r.current_balance).toLocaleString('en-US')}
              </td>
              <td className="text-right text-slate-500">{r.last_move_date ?? '—'}</td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-4 text-center text-slate-500">
                No partners — try a different kind or import the ledger.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
