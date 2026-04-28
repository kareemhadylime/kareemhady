import { HelpCircle, ExternalLink } from 'lucide-react';
import type { ThreadHeader } from '@/lib/beithady/communication/inbox';

// Q.1 — fallback chip for the rare case where a conversation has no
// linked reservation_id (Q.0 found 21 such conversations across the
// open inbox). Surfaces a Guesty deep-link the agent can use to
// search for the guest by phone or email.

export function NoReservationFallback({ header }: { header: ThreadHeader }) {
  // Construct a Guesty inbox search query — phone wins over email
  // because Guesty's inbox search keys on phone first.
  const q = header.guest_phone || header.guest_email || header.guest_full_name;
  const guestyUrl = q
    ? `https://app.guesty.com/inbox?search=${encodeURIComponent(q)}`
    : 'https://app.guesty.com/inbox';

  return (
    <a
      href={guestyUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold text-[11px] uppercase tracking-wide bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition"
      title="No reservation linked — search guest in Guesty"
    >
      <HelpCircle size={12} />
      No reservation linked
      <ExternalLink size={10} className="opacity-60" />
    </a>
  );
}
