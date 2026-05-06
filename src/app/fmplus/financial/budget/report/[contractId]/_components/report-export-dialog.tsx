'use client';

import { useState, useCallback } from 'react';
import { Download, X } from 'lucide-react';
import type { ReportMode, ReportLang } from '@/lib/fmplus/budget/report/types';

const LANG_OPTIONS: { value: ReportLang; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'العربية' },
  { value: 'both', label: 'Both (EN + AR)' },
];

const MODE_LABELS: Record<ReportMode, string> = {
  pre: 'Pre-contract',
  signoff: 'Sign-off',
  customer: 'Customer',
  snapshot: 'Snapshot',
};

function slugify(s: string) {
  return s.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
}

interface ReportExportDialogProps {
  contractId: number;
  yearId: number;
  contractName: string;
  yearIndex: number;
  scenario: string;
  mode: ReportMode;
  isDraftCustomer: boolean;
}

export function ReportExportDialog({
  contractId,
  yearId,
  contractName,
  yearIndex,
  scenario,
  mode,
  isDraftCustomer,
}: ReportExportDialogProps) {
  const [open, setOpen] = useState(false);
  const [lang, setLang] = useState<ReportLang>('en');

  const filename = `${slugify(contractName)}_${scenario}_Y${yearIndex}_${mode}_${lang}.pdf`;
  const downloadUrl = `/api/fmplus/budget/report/${contractId}/${yearId}/pdf?mode=${mode}&lang=${lang}`;

  const handleOpen = useCallback(() => {
    if (!isDraftCustomer) setOpen(true);
  }, [isDraftCustomer]);

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={handleOpen}
        disabled={isDraftCustomer}
        title={isDraftCustomer ? 'Publish this year before exporting customer-facing PDF' : 'Export PDF'}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md border transition-all ${
          isDraftCustomer
            ? 'border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-600 bg-slate-50 dark:bg-slate-900 cursor-not-allowed'
            : 'border-fmplus-gold/50 bg-fmplus-yellow/10 text-fmplus-gold dark:text-fmplus-yellow hover:bg-fmplus-yellow/20 dark:hover:bg-fmplus-gold/20'
        }`}
      >
        <Download size={13} />
        Export PDF
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />

          {/* Dialog */}
          <div className="relative z-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl w-full max-w-sm p-6 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold font-serif text-slate-900 dark:text-slate-100">Export PDF</h3>
              <button
                onClick={() => setOpen(false)}
                className="text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              >
                <X size={16} />
              </button>
            </div>

            {/* Mode (read-only) */}
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-body">Mode</label>
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                {MODE_LABELS[mode]}
              </div>
            </div>

            {/* Language picker */}
            <fieldset className="space-y-2">
              <legend className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-body">Language</legend>
              <div className="space-y-2">
                {LANG_OPTIONS.map(({ value, label }) => (
                  <label key={value} className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="radio"
                      name="lang"
                      value={value}
                      checked={lang === value}
                      onChange={() => setLang(value)}
                      className="accent-fmplus-yellow"
                    />
                    <span className="text-sm text-slate-900 dark:text-slate-100 font-body">{label}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {/* Filename preview */}
            <div className="space-y-1">
              <div className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400 font-body">Filename</div>
              <div className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2.5 py-1.5 font-mono break-all">
                {filename}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end pt-1">
              <button
                onClick={() => setOpen(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
              >
                Cancel
              </button>
              <a
                href={downloadUrl}
                download={filename}
                onClick={() => setOpen(false)}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-fmplus-yellow text-fmplus-black rounded-md hover:bg-fmplus-gold transition-colors"
              >
                <Download size={12} />
                Download PDF
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
