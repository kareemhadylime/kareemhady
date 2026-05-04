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
  activeService: string; // widened to string to accommodate '__revenue' / '__mobilization' sentinels
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
    <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 flex items-center gap-1.5 flex-wrap">
      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-semibold">Service</span>
      {services.map(sl => (
        <button key={sl} type="button" onClick={() => switchService(sl)}
          className={`px-3 py-1 text-[11px] font-semibold rounded-full ${
            sl === activeService
              ? 'bg-indigo-600 text-white'
              : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-700'
          }`}>
          {SERVICE_LABEL[sl]}
        </button>
      ))}
      <span className="mx-1 text-slate-300 dark:text-slate-600">|</span>
      <button type="button"
        onClick={() => switchService('__revenue')}
        className={`px-3 py-1 text-[11px] font-semibold rounded-full ${
          activeService === '__revenue'
            ? 'bg-indigo-600 text-white'
            : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-700'
        }`}>
        💰 Revenue
      </button>
      <button type="button"
        onClick={() => switchService('__mobilization')}
        className={`px-3 py-1 text-[11px] font-semibold rounded-full ${
          activeService === '__mobilization'
            ? 'bg-indigo-600 text-white'
            : 'bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-slate-700'
        }`}>
        🏗️ Mobilization
      </button>
      {isPending && <span className="text-[10px] text-slate-500 dark:text-slate-400">…</span>}
    </div>
  );
}
