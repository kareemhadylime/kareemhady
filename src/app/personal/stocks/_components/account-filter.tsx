'use client';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import type { AccountCode } from '@/lib/personal/stocks/types';

const OPTIONS: Array<AccountCode | 'all'> = ['all', '001', '003', '009'];

export function AccountFilter() {
  const sp = useSearchParams();
  const router = useRouter();
  const path = usePathname();
  const active = (sp.get('account') ?? 'all') as AccountCode | 'all';
  return (
    <div className="flex gap-1.5">
      {OPTIONS.map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => {
            const u = new URLSearchParams(sp.toString());
            u.set('account', a);
            router.replace(`${path}?${u.toString()}`);
          }}
          className={`text-[11px] px-2.5 py-1 rounded ${
            active === a
              ? 'bg-slate-900 text-white'
              : 'bg-white border border-slate-300 text-slate-600'
          }`}
        >
          {a === 'all' ? 'All' : a}
        </button>
      ))}
    </div>
  );
}
