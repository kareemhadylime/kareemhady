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
}

export function ContractHero({
  contractId,
  customer,
  periodLabel,
  currentYearIndex,
  monthsElapsed,
  monthsTotal,
  contracts,
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
