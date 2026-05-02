'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarOff, Ship } from 'lucide-react';

type Props = {
  date: string;
  boatId: string;
  x: number;
  y: number;
  onClose: () => void;
  onBlock: () => void;
};

export function CellContextMenu({ date, boatId, x, y, onClose, onBlock }: Props) {
  const router = useRouter();
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  // Clamp to viewport so a bottom-right corner click doesn't render the menu off-screen.
  const safeX = Math.min(x, typeof window !== 'undefined' ? window.innerWidth - 200 : x);
  const safeY = Math.min(y, typeof window !== 'undefined' ? window.innerHeight - 110 : y);

  return (
    <div
      ref={ref}
      style={{ position: 'fixed', top: safeY, left: safeX, zIndex: 50 }}
      className="bg-white dark:bg-slate-900 rounded-md shadow-lg border border-slate-200 dark:border-slate-700 py-1 text-sm min-w-[180px]"
    >
      <div className="px-3 py-1 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800 mb-1">
        {date}
      </div>
      <button
        type="button"
        onClick={() => {
          onClose();
          onBlock();
        }}
        className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-2"
      >
        <CalendarOff size={14} /> Block this date
      </button>
      <button
        type="button"
        onClick={() => {
          onClose();
          router.push(
            `/emails/boat-rental/owner/reservations/new?boat_id=${encodeURIComponent(boatId)}&date=${encodeURIComponent(date)}`
          );
        }}
        className="w-full text-left px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-2"
      >
        <Ship size={14} /> Reserve this date
      </button>
    </div>
  );
}
