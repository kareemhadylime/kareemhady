// src/app/fmplus/performance/_components/contract-hero.tsx
import { ContractSwitcher } from './contract-switcher';

interface Props {
  contractId: number;
  contractName: string;
  customer: string | null;
  periodLabel: string;
  currentYearIndex: number;
  monthsElapsed: number;
  monthsTotal: number;
  contracts: { id: number; name: string; customer?: string | null }[];
  revenueSource?: 'odoo_actual' | 'service_revenue' | 'contract_value_fallback' | 'none';
}

export function ContractHero({
  contractId,
  customer,
  periodLabel,
  currentYearIndex,
  monthsElapsed,
  monthsTotal,
  contracts,
  revenueSource,
}: Props) {
  return (
    <header className="ix-card p-5 sm:p-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-fmplus-gold font-semibold mb-1">
          FMPLUS · Performance
        </p>
        <ContractSwitcher
          contracts={contracts}
          currentContractId={contractId}
          variant="hero"
        />
        {customer && (
          <p className="text-sm text-slate-400 mt-1 font-body">{customer}</p>
        )}
        {revenueSource === 'contract_value_fallback' && (
          <p className="text-[11px] text-amber-400/80 mt-1">
            Revenue estimated from contract value · fill{' '}
            <a
              href={`/fmplus/financial/budget/edit?contract=${contractId}&service=__revenue`}
              className="underline"
            >
              monthly revenue per service
            </a>{' '}
            to refine
          </p>
        )}
        {revenueSource === 'service_revenue' && (
          <p className="text-[11px] text-slate-400 mt-1">
            Revenue from budget targets · refine with Odoo actuals once invoices post
          </p>
        )}
      </div>

      <div className="text-left sm:text-right shrink-0">
        <p className="text-[10px] uppercase tracking-wide text-fmplus-gold font-semibold mb-1">
          Period
        </p>
        <p className="text-xl font-bold tabular-nums text-fmplus-yellow font-serif">
          {periodLabel}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          Y{currentYearIndex} · {monthsElapsed} of {monthsTotal} mo elapsed
        </p>
      </div>
    </header>
  );
}
