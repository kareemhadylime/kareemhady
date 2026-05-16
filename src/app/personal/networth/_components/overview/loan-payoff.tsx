'use client';

import Link from 'next/link';

type LoanSummary = {
  liability_id: string;
  name: string;
  remaining_months: number;
  final_due_date: string;
};

export function LoanPayoff({ loans }: { loans: LoanSummary[] }) {
  if (loans.length === 0) {
    return (
      <div className="ix-card p-5">
        <div className="text-sm font-semibold mb-2">Loan payoff projection</div>
        <p className="text-sm text-slate-500">No active loans.</p>
      </div>
    );
  }
  return (
    <div className="ix-card p-5">
      <div className="text-sm font-semibold mb-2">Loan payoff projection</div>
      <ul className="space-y-2 text-sm">
        {loans.map(l => (
          <li key={l.liability_id}>
            <Link
              href={`/personal/networth/liabilities/${l.liability_id}`}
              className="hover:underline"
            >
              <span className="font-medium">{l.name}</span>
              <span className="text-slate-500">
                {' '}— {l.remaining_months} month{l.remaining_months === 1 ? '' : 's'} left
              </span>
              <span className="block text-xs text-slate-400 ml-0 mt-0.5">
                Final: {l.final_due_date}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
