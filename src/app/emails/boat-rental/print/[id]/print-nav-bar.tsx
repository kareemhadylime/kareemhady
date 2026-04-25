'use client';

import { ChevronLeft, Home, Printer } from 'lucide-react';

// On-screen nav strip above the A4 sheet. Hidden in the printed PDF
// via Tailwind `print:hidden` so it never bleeds onto the saved file.
//
// Back / Menu drive the *opener* tab (the catalogue page that spawned
// this print tab), then close this tab — so the user always lands on
// the destination page without the dead print tab lingering.

type Props = {
  catalogueHref: string;
  menuHref: string;
};

export function PrintNavBar({ catalogueHref, menuHref }: Props) {
  function navigateOpenerAndClose(href: string) {
    let openerHandled = false;
    try {
      // window.opener is null when the tab was opened with rel="noopener".
      // PdfLink uses window.open which preserves opener for same-origin.
      const op = window.opener as Window | null;
      if (op && !op.closed) {
        op.location.href = href;
        op.focus();
        openerHandled = true;
      }
    } catch {
      // Cross-origin or some other access error — fall through to fallback.
    }

    if (openerHandled) {
      // Try to close this tab. window.close() only succeeds for
      // script-opened tabs; if it fails (e.g. user landed here directly),
      // fall back to navigating self to the same href.
      window.close();
      // If we're still here ~50ms later, the close was blocked — hop self.
      setTimeout(() => {
        window.location.href = href;
      }, 50);
    } else {
      // No opener — navigate this tab.
      window.location.href = href;
    }
  }

  return (
    <div className="print:hidden sticky top-0 z-50 bg-slate-900 text-white px-4 py-3 flex items-center justify-between gap-3 flex-wrap shadow-lg border-b border-slate-700">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => navigateOpenerAndClose(catalogueHref)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/30 text-sm font-semibold transition"
        >
          <ChevronLeft size={16} /> Back to Catalogue
        </button>
        <button
          type="button"
          onClick={() => navigateOpenerAndClose(menuHref)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/30 text-sm font-semibold transition"
        >
          <Home size={16} /> Main Menu
        </button>
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
