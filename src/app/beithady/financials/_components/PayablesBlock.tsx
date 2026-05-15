'use client';

import React, { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Wrench, Users, Home as HomeIcon } from 'lucide-react';
import { PayablesDetailButton, cleanPartnerName } from './PayablesDetailModal';
import type { PayablesReport, PayablePartnerRow, CompanyScope } from '@/lib/financials-pnl';

const fmt = (n: number | null | undefined): string => {
  const v = Number(n) || 0;
  return Math.round(v).toLocaleString('en-US');
};

type SortKey = 'name' | 'amount' | null;
type SortDir = 'asc' | 'desc';

export function PayablesBlock({
  payables,
  scope,
  asOf,
  scopeLbl,
}: {
  payables: PayablesReport;
  scope: CompanyScope;
  asOf: string;
  scopeLbl: string;
}) {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <PayablesCard
        title="Vendors Payables"
        icon={<Wrench size={16} className="text-amber-600" />}
        accent="amber"
        data={payables.vendors}
        detailKind="vendor"
        scope={scope}
        asOf={asOf}
        scopeLbl={scopeLbl}
      />
      <PayablesCard
        title="Employee Payables"
        icon={<Users size={16} className="text-indigo-600" />}
        accent="indigo"
        data={payables.employees}
        scope={scope}
        asOf={asOf}
        scopeLbl={scopeLbl}
      />
      <PayablesCard
        title="Owners Payables"
        icon={<HomeIcon size={16} className="text-rose-600" />}
        accent="rose"
        data={payables.owners}
        detailKind="owner"
        scope={scope}
        asOf={asOf}
        scopeLbl={scopeLbl}
      />
    </section>
  );
}

function PayablesCard({
  title,
  icon,
  accent,
  data,
  detailKind,
  scope,
  asOf,
  scopeLbl,
}: {
  title: string;
  icon: React.ReactNode;
  accent: 'amber' | 'indigo' | 'rose';
  data: { total: number; partners: PayablePartnerRow[] };
  detailKind?: 'vendor' | 'owner';
  scope: CompanyScope;
  asOf: string;
  scopeLbl: string;
}) {
  const tint =
    accent === 'amber'
      ? 'bg-amber-50 text-amber-700'
      : accent === 'indigo'
        ? 'bg-indigo-50 text-indigo-700'
        : 'bg-rose-50 text-rose-700';

  const [sortKey, setSortKey] = useState<SortKey>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  function onHeaderClick(key: Exclude<SortKey, null>) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  const sortedPartners = useMemo(() => {
    if (sortKey === null) return data.partners;
    const copy = [...data.partners];
    if (sortKey === 'name') {
      copy.sort((a, b) => {
        const cmp = cleanPartnerName(a.partner_name).localeCompare(
          cleanPartnerName(b.partner_name),
        );
        return sortDir === 'asc' ? cmp : -cmp;
      });
    } else {
      // Signed: negative = payable (we owe), positive = downpayment / credit
      // (partner owes us). 'asc' surfaces biggest payable first.
      copy.sort((a, b) => {
        const cmp = a.amount - b.amount;
        return sortDir === 'asc' ? cmp : -cmp;
      });
    }
    return copy;
  }, [data.partners, sortKey, sortDir]);

  function SortArrow({ k }: { k: Exclude<SortKey, null> }) {
    if (sortKey !== k) return <ArrowUpDown size={10} className="opacity-30" />;
    return sortDir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />;
  }

  return (
    <div className="ix-card p-5 space-y-3 flex flex-col">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          {icon} {title}
        </h3>
        <span className={`text-[11px] px-2 py-0.5 rounded-full ${tint}`}>
          {data.partners.length} {data.partners.length === 1 ? 'partner' : 'partners'}
        </span>
      </div>
      <p className="text-3xl font-bold tabular-nums">{fmt(data.total)}</p>
      <div className="text-[11px] text-slate-500">Net outstanding (residual amount, EGP)</div>
      {data.partners.length === 0 ? (
        <div className="py-4 text-center text-slate-400 text-sm">No outstanding balances.</div>
      ) : (
        <div className="overflow-y-auto max-h-[360px] -mx-2">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="border-b border-slate-200">
                <th className="text-left px-2 py-1.5 text-[11px] font-semibold text-slate-500">
                  <button
                    type="button"
                    onClick={() => onHeaderClick('name')}
                    className="inline-flex items-center gap-1 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
                  >
                    Name
                    <SortArrow k="name" />
                  </button>
                </th>
                <th className="text-right px-2 py-1.5 text-[11px] font-semibold text-slate-500">
                  <button
                    type="button"
                    onClick={() => onHeaderClick('amount')}
                    className="inline-flex items-center gap-1 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ml-auto"
                  >
                    Amount
                    <SortArrow k="amount" />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedPartners.slice(0, 40).map(p => (
                <tr key={p.partner_id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5 truncate max-w-[200px]" title={p.partner_name}>
                    {cleanPartnerName(p.partner_name)}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{fmt(p.amount)}</td>
                </tr>
              ))}
              {sortedPartners.length > 40 && (
                <tr>
                  <td colSpan={2} className="px-2 py-2 text-center text-[11px] text-slate-400">
                    …and {sortedPartners.length - 40} more.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {detailKind && data.partners.length > 0 && (
        <PayablesDetailButton
          kind={detailKind}
          title={title}
          subtitle={`${scopeLbl} · as of ${asOf}`}
          partners={data.partners}
          total={data.total}
          scope={scope}
          asOf={asOf}
        />
      )}
    </div>
  );
}
