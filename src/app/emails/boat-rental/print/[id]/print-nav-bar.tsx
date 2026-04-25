'use client';

import Link from 'next/link';
import { ChevronLeft, Home, Printer } from 'lucide-react';

// On-screen nav strip above the A4 sheet. Hidden in the printed PDF
// via Tailwind `print:hidden` so it never bleeds onto the saved file.

type Props = {
  catalogueHref: string;
  menuHref: string;
};

export function PrintNavBar({ catalogueHref, menuHref }: Props) {
  return (
    <div className="print:hidden sticky top-0 z-50 bg-slate-900 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap shadow-lg border-b border-slate-700">
      <div className="flex items-center gap-2 flex-wrap">
        <Link
          href={catalogueHref}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/30 text-sm font-semibold transition"
        >
          <ChevronLeft size={16} /> Back to Catalogue
        </Link>
        <Link
          href={menuHref}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/30 text-sm font-semibold transition"
        >
          <Home size={16} /> Main Menu
        </Link>
      </div>
      <button
        type="button"
        onClick={() => {
          try {
            window.print();
          } catch {
            // ignore — user can still hit ⌘P / Ctrl+P
          }
        }}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800 text-sm font-semibold transition"
      >
        <Printer size={16} /> Print / Save PDF
      </button>
    </div>
  );
}
