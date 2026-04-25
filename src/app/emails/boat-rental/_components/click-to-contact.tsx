import { Phone, MessageCircle } from 'lucide-react';

// Compact phone display with tap-to-call + tap-to-WhatsApp.
// Links use tel: and wa.me/ deep linkers — no JS required.
// Pre-fill text supported on the WhatsApp side via ?text=.

type Props = {
  phone: string;            // any format; digits-only normalized for href
  display?: string;         // optional pretty text; defaults to phone
  whatsappText?: string;    // pre-filled WA message
  className?: string;
  size?: 'sm' | 'md';
};

function digits(s: string): string {
  return (s || '').replace(/[^0-9]/g, '');
}

export function ClickToContact({ phone, display, whatsappText, className = '', size = 'sm' }: Props) {
  const d = digits(phone);
  if (!d) return null;
  const text = display || (phone.startsWith('+') ? phone : `+${d}`);
  const wa = whatsappText
    ? `https://wa.me/${d}?text=${encodeURIComponent(whatsappText)}`
    : `https://wa.me/${d}`;
  const iconSize = size === 'md' ? 16 : 13;
  const padBtn = size === 'md' ? 'w-10 h-10' : 'w-9 h-9';
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <span className="text-sm">{text}</span>
      <a
        href={`tel:${d}`}
        title={`Call ${text}`}
        aria-label={`Call ${text}`}
        className={`inline-flex items-center justify-center ${padBtn} rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition`}
      >
        <Phone size={iconSize} />
      </a>
      <a
        href={wa}
        target="_blank"
        rel="noreferrer"
        title={`WhatsApp ${text}`}
        aria-label={`WhatsApp ${text}`}
        className={`inline-flex items-center justify-center ${padBtn} rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900 transition`}
      >
        <MessageCircle size={iconSize} />
      </a>
    </span>
  );
}
