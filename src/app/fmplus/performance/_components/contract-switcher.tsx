// src/app/fmplus/performance/_components/contract-switcher.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ChevronDown } from 'lucide-react';

interface Contract { id: number; name: string; customer?: string | null; }

export function ContractSwitcher({
  contracts,
  currentContractId,
  variant = 'sidebar',
}: {
  contracts: Contract[];
  currentContractId: number;
  variant?: 'sidebar' | 'hero';
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = contracts.find(c => c.id === currentContractId);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function pick(id: number) {
    setOpen(false);
    if (id === currentContractId) return;
    // Preserve period chip / offset / from / to / compare across navigation
    const qs = sp.toString();
    router.push(`/fmplus/performance/${id}${qs ? `?${qs}` : ''}`);
  }

  if (contracts.length <= 1) {
    if (variant === 'hero') {
      return (
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-serif text-fmplus-yellow">
          {current?.name ?? 'Unknown contract'}
        </h1>
      );
    }
    return null;
  }

  if (variant === 'hero') {
    return (
      <div className="relative inline-block" ref={ref}>
        <button
          onClick={() => setOpen(s => !s)}
          className="inline-flex items-center gap-2 text-2xl sm:text-3xl font-bold tracking-tight font-serif text-fmplus-yellow hover:text-fmplus-gold transition"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <span>{current?.name ?? 'Unknown contract'}</span>
          <ChevronDown size={20} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="absolute left-0 top-full mt-2 z-30 bg-slate-800 border border-slate-700 rounded-lg shadow-xl min-w-72 max-h-80 overflow-y-auto">
            {contracts.map(c => (
              <button
                key={c.id}
                onClick={() => pick(c.id)}
                className={`w-full text-left px-3 py-2 text-sm transition ${
                  c.id === currentContractId
                    ? 'bg-fmplus-yellow text-fmplus-black font-semibold'
                    : 'text-slate-200 hover:bg-slate-700/50 hover:text-fmplus-yellow'
                }`}
              >
                <div className="font-semibold">{c.name}</div>
                {c.customer && <div className="text-xs text-slate-400">{c.customer}</div>}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // sidebar variant
  return (
    <div className="relative px-3" ref={ref}>
      <button
        onClick={() => setOpen(s => !s)}
        className="w-full text-left text-sm px-3 py-1.5 rounded-lg transition flex items-center justify-between bg-slate-800/50 hover:bg-slate-700/50 text-slate-200"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{current?.name ?? 'Pick contract'}</span>
        <ChevronDown size={14} className={`transition-transform shrink-0 ml-1 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 z-20 bg-slate-800 border border-slate-700 rounded-lg shadow-lg max-h-72 overflow-y-auto">
          {contracts.map(c => (
            <button
              key={c.id}
              onClick={() => pick(c.id)}
              className={`w-full text-left text-sm px-3 py-1.5 transition ${
                c.id === currentContractId
                  ? 'bg-fmplus-yellow text-fmplus-black font-semibold'
                  : 'text-slate-200 hover:bg-slate-700/50 hover:text-fmplus-yellow'
              }`}
            >
              <div className="truncate">
                {c.name}
                {c.customer && <span className="text-slate-400 ml-1">· {c.customer}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
