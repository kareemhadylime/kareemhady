// src/app/fmplus/performance/_components/project-filter.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';

interface Contract { id: number; name: string; customer?: string | null; }

export function ProjectFilter({ contracts }: { contracts: Contract[] }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();

  const selected = decodeProjects(sp.get('projects'), contracts.map(c => c.id));
  const allSelected = selected.size === contracts.length;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (open && ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function update(next: Set<number>) {
    const params = new URLSearchParams(sp.toString());
    // Encode: empty or "all" -> drop the param. Otherwise comma-separated ids.
    if (next.size === 0 || next.size === contracts.length) {
      params.delete('projects');
    } else {
      params.set('projects', Array.from(next).sort((a, b) => a - b).join(','));
    }
    router.replace(`${path}?${params.toString()}`);
  }

  function toggleOne(id: number) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    update(next);
  }

  function toggleAll() {
    if (allSelected) update(new Set());      // explicitly select none
    else update(new Set(contracts.map(c => c.id)));
  }

  const summary =
    allSelected ? `All ${contracts.length}` :
    selected.size === 0 ? 'None' :
    selected.size === 1 ? (contracts.find(c => selected.has(c.id))?.name ?? '1 selected') :
    `${selected.size} of ${contracts.length}`;

  return (
    <div className="relative px-3" ref={ref}>
      <button
        onClick={() => setOpen(s => !s)}
        className="w-full text-left text-sm px-3 py-1.5 rounded-lg transition flex items-center justify-between bg-slate-800/50 hover:bg-slate-700/50 text-slate-200"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown size={14} className={`transition-transform shrink-0 ml-1 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute left-3 right-3 top-full mt-1 z-20 bg-slate-800 border border-slate-700 rounded-lg shadow-lg max-h-72 overflow-y-auto">
          <label className="flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm text-slate-200 hover:bg-slate-700/50 border-b border-slate-700">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="accent-fmplus-yellow"
            />
            <span className="font-semibold">All projects</span>
          </label>
          {contracts.map(c => (
            <label key={c.id} className="flex items-center gap-2 px-3 py-1.5 cursor-pointer text-sm text-slate-200 hover:bg-slate-700/50">
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggleOne(c.id)}
                className="accent-fmplus-yellow"
              />
              <span className="truncate">
                {c.name}
                {c.customer && <span className="text-slate-400 ml-1">{`· ${c.customer}`}</span>}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function decodeProjects(raw: string | null, all: number[]): Set<number> {
  if (!raw) return new Set(all);            // missing -> all
  const ids = raw.split(',').map(Number).filter(n => Number.isFinite(n) && n > 0);
  if (ids.length === 0) return new Set(all);
  return new Set(ids);
}
