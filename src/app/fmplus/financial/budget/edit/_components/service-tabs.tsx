'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import type { ServiceLine } from '@/lib/fmplus/budget/types';

const SERVICE_LABEL: Record<ServiceLine, string> = {
  hk: 'HK', mep: 'MEP', landscape: 'Landscape', security: 'Security',
  pest_ctrl: 'Pest', waste_mgmt: 'Waste', back_office: 'Back Office',
};

interface Props {
  contractId: number;
  yearIndex: number;
  services: ServiceLine[];
  activeService: ServiceLine;
}

export function ServiceTabs({ services, activeService }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const switchService = (sl: string) => {
    const np = new URLSearchParams(params);
    np.set('service', sl);
    startTransition(() => {
      router.replace(`?${np.toString()}`, { scroll: false });
    });
  };

  return (
    <div className="bg-bg-secondary border border-border rounded-lg px-3 py-1.5 flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] text-text-secondary uppercase font-semibold">Service</span>
      {services.map(sl => (
        <button key={sl} type="button" onClick={() => switchService(sl)}
          className={`px-3 py-1 text-[11px] font-semibold rounded-full ${
            sl === activeService
              ? 'bg-accent text-white'
              : 'bg-bg-tertiary text-text-secondary hover:text-text-primary border border-border'
          }`}>
          {SERVICE_LABEL[sl]}
        </button>
      ))}
      <span className="mx-1 text-border">|</span>
      <button type="button" disabled
        className="px-3 py-1 text-[11px] bg-bg-tertiary border border-border rounded-full text-text-secondary opacity-60 cursor-not-allowed"
        title="Revenue tab ships in Task 25">
        💰 Revenue
      </button>
      <button type="button" disabled
        className="px-3 py-1 text-[11px] bg-bg-tertiary border border-border rounded-full text-text-secondary opacity-60 cursor-not-allowed"
        title="Mobilization tab ships in Task 25">
        🏗️ Mobilization
      </button>
      {isPending && <span className="text-[10px] text-text-secondary">…</span>}
    </div>
  );
}
