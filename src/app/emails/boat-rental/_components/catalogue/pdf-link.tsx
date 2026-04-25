'use client';

import { Download } from 'lucide-react';

// Opens the print route in a new tab via window.open so the new tab
// keeps a reference to its opener. The print page's nav bar uses
// window.opener to navigate the originating tab back to the catalogue
// or main menu, then closes itself — same-origin so this is allowed.
//
// Falling back to a direct same-tab navigation if pop-ups are blocked.

export function PdfLink({ boatId }: { boatId: string }) {
  const href = `/emails/boat-rental/print/${boatId}`;

  function open(e: React.MouseEvent) {
    e.preventDefault();
    const opened = window.open(href, '_blank');
    if (!opened) {
      // Pop-up blocker fell back to nothing — navigate self.
      window.location.href = href;
    }
  }

  return (
    <a
      href={href}
      onClick={open}
      target="_blank"
      // No rel='noopener' — we WANT opener so the print tab can drive
      // the originating tab on Back/Main Menu.
      className="ix-btn-primary text-sm inline-flex items-center gap-2 shrink-0"
    >
      <Download size={14} /> Download PDF
    </a>
  );
}
