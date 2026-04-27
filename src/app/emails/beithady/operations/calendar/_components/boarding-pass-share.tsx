'use client';

import { useState, useTransition } from 'react';
import { Copy, MessageCircle, Check } from 'lucide-react';
import { getBoardingPassUrlAction } from '../actions';

export function BoardingPassShare({
  reservationId,
  guestPhone,
  guestName,
}: {
  reservationId: string;
  guestPhone: string | null;
  guestName: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildAbsoluteUrl = async (): Promise<string | null> => {
    return new Promise(resolve => {
      startTransition(async () => {
        const r = await getBoardingPassUrlAction({ reservationId });
        if (!r.ok) {
          setError(r.error || 'Failed to fetch boarding pass URL');
          resolve(null);
          return;
        }
        const abs = `${window.location.origin}${r.url}`;
        resolve(abs);
      });
    });
  };

  const onCopy = async () => {
    const url = await buildAbsoluteUrl();
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Clipboard not available — copy manually: ' + url);
    }
  };

  const onWhatsApp = async () => {
    const url = await buildAbsoluteUrl();
    if (!url) return;
    const phone = (guestPhone || '').replace(/[^\d]/g, '');
    if (!phone) {
      setError('No phone number on file for this guest');
      return;
    }
    const text = `Hi${guestName ? ' ' + guestName : ''}! Here is your boarding pass for your upcoming stay: ${url}`;
    const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
    window.open(waUrl, '_blank', 'noopener');
  };

  return (
    <div className="space-y-1.5 pt-1">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCopy}
          disabled={pending}
          className="ix-btn-secondary !text-xs"
        >
          {copied ? <Check size={11} className="text-emerald-600" /> : <Copy size={11} />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
        <button
          type="button"
          onClick={onWhatsApp}
          disabled={pending || !guestPhone}
          className="ix-btn-secondary !text-xs"
          title={guestPhone ? 'Open WhatsApp with prefilled message' : 'No phone number on file'}
        >
          <MessageCircle size={11} /> Send via WhatsApp
        </button>
      </div>
      {error && (
        <div className="text-[10px] text-rose-600 break-all">{error}</div>
      )}
    </div>
  );
}
