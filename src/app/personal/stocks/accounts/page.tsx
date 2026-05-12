import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase';
import { fmtEgp } from '../_components/kpi-tile';

export const dynamic = 'force-dynamic';

const META: Record<
  string,
  { title: string; subtitle: string; accent: string }
> = {
  '001': {
    title: 'Trading',
    subtitle: 'Main trading account · cash deposits land here',
    accent: 'sky',
  },
  '003': {
    title: 'Margin',
    subtitle: 'Leveraged trading · monthly interest on debit balance',
    accent: 'rose',
  },
  '009': {
    title: 'Fund',
    subtitle:
      'ICS Makaseb 2nd Edition Fund holdings (interest-bearing)',
    accent: 'emerald',
  },
};

export default async function AccountsLanding() {
  const client = supabaseAdmin();
  const accs = await client
    .from('personal_stock_accounts')
    .select('id, code, kind')
    .order('code');
  const balances = await client
    .from('v_personal_stock_account_balance')
    .select('account_id, balance_egp, occurred_at')
    .order('occurred_at', { ascending: false });
  const latest = new Map<number, { bal: number; date: string }>();
  for (const r of balances.data ?? []) {
    if (!latest.has(r.account_id))
      latest.set(r.account_id, {
        bal: Number(r.balance_egp),
        date: r.occurred_at,
      });
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
      {(accs.data ?? []).map((a: { id: number; code: string; kind: string }) => {
        const meta = META[a.code];
        const last = latest.get(a.id);
        // Use static class strings so Tailwind's JIT picks them up
        const borderClass =
          meta.accent === 'sky'
            ? 'border-l-sky-500'
            : meta.accent === 'rose'
              ? 'border-l-rose-500'
              : 'border-l-emerald-500';
        return (
          <Link
            key={a.id}
            href={`/personal/stocks/accounts/${a.code}`}
            className={`ix-card p-4 hover:shadow-md transition border-l-4 ${borderClass}`}
          >
            <div className="text-[10px] uppercase text-slate-400">
              Account {a.code}
            </div>
            <div className="text-lg font-semibold mt-1">{meta.title}</div>
            <div className="text-xs text-slate-500 mt-0.5">{meta.subtitle}</div>
            <div className="mt-3">
              <div className="text-[10px] uppercase text-slate-400">
                Last balance
              </div>
              <div
                className={`text-xl font-semibold ${(last?.bal ?? 0) < 0 ? 'text-rose-700' : 'text-emerald-700'}`}
              >
                {last ? fmtEgp(last.bal) : '—'}
              </div>
              {last && (
                <div className="text-[10px] text-slate-400">
                  as of {last.date}
                </div>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
