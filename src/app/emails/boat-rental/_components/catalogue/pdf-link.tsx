'use client';

import { Download } from 'lucide-react';

// Opens the print route in a new tab. The print page auto-fires
// window.print() once images are loaded, so the user gets the
// browser's native "Save as PDF" dialog without any extra clicks
// inside the new tab.

export function PdfLink({ boatId }: { boatId: string }) {
  const href = `/emails/boat-rental/print/${boatId}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="ix-btn-primary text-sm inline-flex items-center gap-2 shrink-0"
    >
      <Download size={14} /> Download PDF
    </a>
  );
}
