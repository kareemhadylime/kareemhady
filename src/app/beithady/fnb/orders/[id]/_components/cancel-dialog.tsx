'use client';
import { useState } from 'react';

export function CancelDialog({
  orderId, onCancelled,
}: { orderId: string; onCancelled: (o: any) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function go() {
    if (reason.length < 3) { alert('Reason required'); return; }
    setBusy(true);
    const res = await fetch(`/api/beithady/fnb/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    setBusy(false);
    if (!res.ok) {
      alert((await res.json().catch(() => ({}))).error || 'Failed');
      return;
    }
    // Re-fetch detail
    const d = await fetch(`/api/beithady/fnb/orders/${orderId}`);
    if (d.ok) onCancelled((await d.json()).order);
    setOpen(false);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="ix-btn-danger px-4 py-2"
      >Cancel order</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="ix-card p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold mb-3">Cancel order</h3>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value.slice(0, 500))}
              placeholder="Reason (logged to audit)"
              rows={3}
              className="w-full ix-input"
            />
            <div className="mt-3 flex gap-2 justify-end">
              <button
                onClick={() => setOpen(false)}
                className="ix-btn-secondary px-3 py-1.5 text-sm"
              >Back</button>
              <button
                onClick={go}
                disabled={busy}
                className="ix-btn-danger px-3 py-1.5 text-sm disabled:opacity-50"
              >{busy ? 'Cancelling…' : 'Cancel order'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
