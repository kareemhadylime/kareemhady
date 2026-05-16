'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { cairoTodayIso } from '@/lib/fmt-date';

type UpcomingRow = {
  source: 'schedule' | 'recurring';
  refId: string;
  dueDate: string;
  displayName: string;
  category: string;
  amount: number;
  currency: string;
  liabilityId: string | null;
};

export function UpcomingPayments({ rows }: { rows: UpcomingRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cairoToday = cairoTodayIso();

  async function markPaid(row: UpcomingRow) {
    if (row.source !== 'schedule' || !row.liabilityId) {
      setError('Recurring payments are marked paid via the Recurring tab.');
      return;
    }
    setBusy(row.refId); setError(null);
    try {
      const res = await fetch(`/api/personal/networth/liabilities/${row.liabilityId}/mark-paid`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          scheduleId: row.refId,
          occurredOn: cairoToday,
          amount: row.amount,
        }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? 'mark-paid failed');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (rows.length === 0) {
    return (
      <div className="ix-card p-5">
        <div className="text-sm font-semibold mb-2">Upcoming payments — next 30 days</div>
        <p className="text-sm text-slate-500">Nothing due in the next 30 days.</p>
      </div>
    );
  }

  return (
    <div className="ix-card p-5">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-semibold">Upcoming payments — next 30 days</div>
        {error && <span className="text-xs text-rose-600">{error}</span>}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800">
            <th className="py-2">Due</th>
            <th className="py-2">Name</th>
            <th className="py-2">Category</th>
            <th className="py-2">Amount</th>
            <th className="py-2 text-right"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={`${r.source}-${r.refId}`} className="border-b border-slate-100 dark:border-slate-900">
              <td className="py-2">{r.dueDate}</td>
              <td className="py-2 font-medium">{r.displayName}</td>
              <td className="py-2 text-slate-500">{r.category}</td>
              <td className="py-2">{r.currency} {Number(r.amount).toLocaleString()}</td>
              <td className="py-2 text-right">
                {r.source === 'schedule' && r.liabilityId ? (
                  <button onClick={() => markPaid(r)} disabled={busy === r.refId}
                    className="text-indigo-600 text-xs hover:underline disabled:text-slate-400">
                    {busy === r.refId ? 'Marking…' : 'Mark paid'}
                  </button>
                ) : (
                  <span className="text-xs text-slate-400">Recurring</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
