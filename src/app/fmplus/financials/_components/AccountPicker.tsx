'use client';

import { useEffect, useState } from 'react';

type Plan = { id: number; name: string };
type ActiveAccount = { account_id: number; name: string; abs_balance: number };

type Props =
  | {
      mode: 'plans';
      selectedPlanIds?: number[];
      buildHref: (overrides?: Partial<Record<string, string | undefined>>) => string;
    }
  | {
      mode: 'accounts';
      selectedPlanId?: number;
      selectedAccountIds?: number[];
      asof: string;
      granularity: 'monthly' | 'quarterly' | 'yearly';
      buildHref: (overrides?: Partial<Record<string, string | undefined>>) => string;
    };

function asofToDateRange(
  granularity: 'monthly' | 'quarterly' | 'yearly',
  asof: string
): { from: string; to: string } {
  if (granularity === 'monthly') {
    const m = /^(\d{4})-(\d{2})$/.exec(asof);
    if (m) {
      const yy = Number(m[1]);
      const mm = Number(m[2]);
      const last = new Date(Date.UTC(yy, mm, 0));
      const pad = (n: number) => String(n).padStart(2, '0');
      return {
        from: `${yy}-${pad(mm)}-01`,
        to: `${yy}-${pad(mm)}-${pad(last.getUTCDate())}`,
      };
    }
  }
  if (granularity === 'quarterly') {
    const m = /^(\d{4})-Q([1-4])$/.exec(asof);
    if (m) {
      const yy = Number(m[1]);
      const q = Number(m[2]);
      const start = (q - 1) * 3;
      const last = new Date(Date.UTC(yy, start + 3, 0));
      const pad = (n: number) => String(n).padStart(2, '0');
      return {
        from: `${yy}-${pad(start + 1)}-01`,
        to: `${yy}-${pad(start + 3)}-${pad(last.getUTCDate())}`,
      };
    }
  }
  if (granularity === 'yearly') {
    const m = /^(\d{4})$/.exec(asof);
    if (m) return { from: `${m[1]}-01-01`, to: `${m[1]}-12-31` };
  }
  // Fallback: today's month.
  const now = new Date();
  const yy = now.getUTCFullYear();
  const mm = now.getUTCMonth() + 1;
  const last = new Date(Date.UTC(yy, mm, 0));
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    from: `${yy}-${pad(mm)}-01`,
    to: `${yy}-${pad(mm)}-${pad(last.getUTCDate())}`,
  };
}

export function AccountPicker(props: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [accounts, setAccounts] = useState<ActiveAccount[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch plans once
  useEffect(() => {
    let cancelled = false;
    fetch('/api/fmplus/plans')
      .then(r => r.json())
      .then(j => {
        if (cancelled) return;
        if (Array.isArray(j.plans)) setPlans(j.plans);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Fetch active accounts when plan or period changes (accounts mode only)
  const mode = props.mode;
  const selectedPlanId = props.mode === 'accounts' ? props.selectedPlanId : undefined;
  const asof = props.mode === 'accounts' ? props.asof : undefined;
  const granularity = props.mode === 'accounts' ? props.granularity : undefined;

  useEffect(() => {
    if (mode !== 'accounts' || !selectedPlanId) {
      setAccounts([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const { from, to } = asofToDateRange(
      granularity as 'monthly' | 'quarterly' | 'yearly',
      asof as string
    );
    fetch(`/api/fmplus/active-accounts?plan_id=${selectedPlanId}&from=${from}&to=${to}`)
      .then(r => r.json())
      .then(j => {
        if (cancelled) return;
        if (Array.isArray(j.accounts)) setAccounts(j.accounts);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [mode, selectedPlanId, asof, granularity]);

  if (props.mode === 'plans') {
    const sel = new Set(props.selectedPlanIds || []);
    return (
      <div className="ix-card p-3 space-y-2 bg-amber-50/30">
        <p className="text-xs font-semibold text-amber-800">Select plans to compare side-by-side</p>
        <div className="flex flex-wrap gap-2">
          {plans.length === 0 && <span className="text-xs text-slate-400">Loading plans…</span>}
          {plans.map(p => {
            const active = sel.has(p.id);
            const next = new Set(sel);
            if (active) next.delete(p.id); else next.add(p.id);
            const nextStr = next.size === 0 ? undefined : Array.from(next).join(',');
            return (
              <a
                key={p.id}
                href={props.buildHref({ plans: nextStr })}
                className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                  active
                    ? 'bg-amber-600 text-white border-amber-700'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {active ? '✓ ' : ''}{p.name}
              </a>
            );
          })}
        </div>
      </div>
    );
  }

  // mode === 'accounts'
  const sel = new Set(props.selectedAccountIds || []);
  return (
    <div className="ix-card p-3 space-y-3 bg-amber-50/30">
      <div className="flex items-center gap-3">
        <span className="text-xs font-semibold text-amber-800">Plan:</span>
        <select
          className="ix-input text-sm w-[220px]"
          value={props.selectedPlanId || ''}
          onChange={e => {
            const id = Number(e.currentTarget.value);
            if (Number.isFinite(id) && id > 0) {
              window.location.href = props.buildHref({ plan: String(id), accounts: undefined });
            }
          }}
        >
          <option value="">Pick a plan…</option>
          {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {loading && <span className="text-xs text-slate-400">Loading active accounts…</span>}
      </div>

      {props.selectedPlanId !== undefined && (
        <div className="flex flex-wrap gap-2">
          {accounts.length === 0 && !loading && (
            <span className="text-xs text-slate-400">No active accounts for this plan in the selected period.</span>
          )}
          {accounts.map(a => {
            const active = sel.has(a.account_id);
            const next = new Set(sel);
            if (active) next.delete(a.account_id); else next.add(a.account_id);
            const nextStr = next.size === 0 ? undefined : Array.from(next).join(',');
            return (
              <a
                key={a.account_id}
                href={props.buildHref({ accounts: nextStr })}
                className={`px-2 py-1 rounded text-xs border transition ${
                  active
                    ? 'bg-amber-600 text-white border-amber-700'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
                title={`abs balance: ${Math.round(a.abs_balance).toLocaleString()}`}
              >
                {active ? '✓ ' : ''}{a.name}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
