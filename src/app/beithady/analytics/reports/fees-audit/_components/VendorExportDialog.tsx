'use client';

import { useState } from 'react';
import { X, Download, Loader2 } from 'lucide-react';
import type { FeeAuditConfig } from '@/lib/beithady/fees-audit/types';

const VENDORS = [
  { key: 'booking_com', label: 'Booking.com (price upload)' },
  { key: 'airbnb', label: 'Airbnb (rate calendar)' },
  { key: 'vrbo', label: 'Vrbo (CSV export)' },
] as const;

export function VendorExportDialog({
  config,
  onClose,
}: {
  config: FeeAuditConfig;
  onClose: () => void;
}) {
  const [vendor, setVendor] = useState<typeof VENDORS[number]['key']>('booking_com');
  const [downloading, setDownloading] = useState(false);

  async function download() {
    setDownloading(true);
    try {
      const res = await fetch('/api/beithady/fees-audit/vendor-export', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ vendor, config }),
      });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `fee-audit-${vendor}-${config.startDate}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-xl shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <header className="bg-cyan-700 text-white px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-cyan-200">
              <Download size={11} className="inline mr-1" /> Vendor Export
            </p>
            <h2 className="text-lg font-bold">Pick a CSV template</h2>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <X size={18} />
          </button>
        </header>
        <main className="p-5 space-y-3">
          <div className="space-y-2">
            {VENDORS.map(v => (
              <label
                key={v.key}
                className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer ${
                  vendor === v.key
                    ? 'border-cyan-600 bg-cyan-50 dark:bg-cyan-900/20'
                    : 'border-slate-200 dark:border-slate-700'
                }`}
              >
                <input
                  type="radio"
                  checked={vendor === v.key}
                  onChange={() => setVendor(v.key)}
                />
                <span className="text-sm font-medium">{v.label}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            CSV will cover {config.windowDays} days starting {config.startDate}, all selected buildings + listings.
          </p>
          <button
            onClick={download}
            disabled={downloading}
            className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white hover:bg-cyan-800 disabled:opacity-50"
          >
            {downloading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {downloading ? 'Generating…' : 'Download CSV'}
          </button>
        </main>
      </div>
    </div>
  );
}
