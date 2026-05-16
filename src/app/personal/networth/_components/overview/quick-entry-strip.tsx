'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AddPaymentModal } from '../modals/add-payment-modal';
import { AddLiabilityModal } from '../modals/add-liability-modal';
import { AddAssetModal } from '../modals/add-asset-modal';
import { AddRecurringModal } from '../modals/add-recurring-modal';

type Liability = { id: string; name: string; kind: string };
type Lender = { id: string; name: string; kind: string };

type Open = null | 'payment' | 'liability' | 'asset' | 'recurring';

export function QuickEntryStrip({
  liabilities,
  lenders,
}: {
  liabilities: Liability[];
  lenders: Lender[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Open>(null);

  const onSaved = () => {
    setOpen(null);
    router.refresh();
  };

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Btn label="+ Payment" onClick={() => setOpen('payment')} />
        <Btn label="+ Liability" onClick={() => setOpen('liability')} />
        <Btn label="+ Asset" onClick={() => setOpen('asset')} />
        <Btn label="+ Recurring" onClick={() => setOpen('recurring')} />
      </div>
      <AddPaymentModal
        open={open === 'payment'}
        onClose={() => setOpen(null)}
        onSaved={onSaved}
        liabilities={liabilities}
      />
      <AddLiabilityModal
        open={open === 'liability'}
        onClose={() => setOpen(null)}
        onAdded={onSaved}
        lenders={lenders}
      />
      <AddAssetModal
        open={open === 'asset'}
        onClose={() => setOpen(null)}
        onAdded={onSaved}
      />
      <AddRecurringModal
        open={open === 'recurring'}
        onClose={() => setOpen(null)}
        onSaved={onSaved}
        liabilities={liabilities}
      />
    </>
  );
}

function Btn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="ix-card p-4 text-base font-medium hover:bg-indigo-50 dark:hover:bg-indigo-950 hover:border-indigo-400 transition cursor-pointer"
    >
      {label}
    </button>
  );
}
