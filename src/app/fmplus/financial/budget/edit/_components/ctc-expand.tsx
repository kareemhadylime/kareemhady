'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import type { BudgetLine } from '@/lib/fmplus/budget/schema';
import { updateLineCtcAction } from '../actions';

interface Props {
  line: BudgetLine;
  canEdit: boolean;
}

const CTC_FIELDS: Array<{ key: keyof BudgetLine; label: string; ar: string }> = [
  { key: 'ctc_net',       label: 'Net',         ar: 'صافي' },
  { key: 'ctc_relievers', label: 'Relievers',   ar: 'بدلاء' },
  { key: 'ctc_ot',        label: 'OT',          ar: 'عمل إضافي' },
  { key: 'ctc_training',  label: 'Training',    ar: 'تدريب' },
  { key: 'ctc_insurance', label: 'Insurance',   ar: 'تأمين' },
  { key: 'ctc_medical',   label: 'Medical',     ar: 'طبي' },
];

function num(v: unknown): number {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function CtcExpand({ line, canEdit }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [ctc, setCtc] = useState({
    ctc_net: line.ctc_net ?? null,
    ctc_relievers: line.ctc_relievers ?? null,
    ctc_ot: line.ctc_ot ?? null,
    ctc_training: line.ctc_training ?? null,
    ctc_insurance: line.ctc_insurance ?? null,
    ctc_medical: line.ctc_medical ?? null,
  });
  const [thresholds, setThresholds] = useState({
    green: line.threshold_green ?? null,
    amber: line.threshold_amber ?? null,
  });

  const sum = num(ctc.ctc_net) + num(ctc.ctc_relievers) + num(ctc.ctc_ot)
    + num(ctc.ctc_training) + num(ctc.ctc_insurance) + num(ctc.ctc_medical);

  const onCtcChange = (key: string, raw: string) => {
    const value = raw === '' ? null : Number(raw);
    setCtc(prev => ({ ...prev, [key]: value }));
  };

  const onThresholdChange = (which: 'green' | 'amber', raw: string) => {
    const value = raw === '' ? null : Number(raw);
    setThresholds(prev => ({ ...prev, [which]: value }));
  };

  const onSave = () => {
    if (!canEdit || !line.id) return;
    setError(null);
    startTransition(async () => {
      try {
        await updateLineCtcAction({
          line_id: line.id,
          ctc_net: ctc.ctc_net,
          ctc_relievers: ctc.ctc_relievers,
          ctc_ot: ctc.ctc_ot,
          ctc_training: ctc.ctc_training,
          ctc_insurance: ctc.ctc_insurance,
          ctc_medical: ctc.ctc_medical,
          threshold_green: thresholds.green,
          threshold_amber: thresholds.amber,
        });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const hasAny = Object.values(ctc).some(v => v !== null);

  return (
    <tr className="bg-blue-500/5 border-b border-slate-200 dark:border-slate-700">
      <td colSpan={6} className="px-4 py-3">
        <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase mb-2 font-semibold">
          CTC breakdown {hasAny ? <span className="text-indigo-600 dark:text-indigo-400">(sums to {sum.toLocaleString()} EGP / mo)</span> : <span className="text-slate-500 dark:text-slate-400">(not set — using flat unit cost)</span>}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
          {CTC_FIELDS.map(f => (
            <div key={f.key as string}>
              <div className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">{f.label}</div>
              <input type="number" inputMode="decimal" min="0" step="0.01"
                value={(ctc[f.key as keyof typeof ctc] ?? '') as number | ''}
                onChange={e => onCtcChange(f.key as string, e.currentTarget.value)}
                disabled={!canEdit || isPending}
                className="w-full px-1.5 py-1 text-right text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded tabular-nums disabled:opacity-50" />
              <div className="text-[9px] text-slate-500 dark:text-slate-400 text-right mt-0.5">{f.ar}</div>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
          <span>💡 Per-line variance threshold (override):</span>
          <span>
            green ≤ <input type="number" min="0" max="100" step="0.1"
              value={thresholds.green ?? ''}
              onChange={e => onThresholdChange('green', e.currentTarget.value)}
              disabled={!canEdit || isPending}
              className="w-12 px-1 py-0.5 text-right text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded tabular-nums disabled:opacity-50" /> %
          </span>
          <span>·</span>
          <span>
            amber ≤ <input type="number" min="0" max="100" step="0.1"
              value={thresholds.amber ?? ''}
              onChange={e => onThresholdChange('amber', e.currentTarget.value)}
              disabled={!canEdit || isPending}
              className="w-12 px-1 py-0.5 text-right text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded tabular-nums disabled:opacity-50" /> %
          </span>
          <span className="text-slate-500 dark:text-slate-400 text-[10px]">
            (leave blank to use global thresholds)
          </span>
          {canEdit && (
            <button type="button" onClick={onSave} disabled={isPending}
              className="ml-auto text-[10px] px-2 py-1 bg-indigo-600 text-white rounded font-semibold flex items-center gap-1 disabled:opacity-50">
              <Save size={10} /> Save CTC
            </button>
          )}
        </div>
        {error && <p className="text-[11px] text-red-400 mt-2">{error}</p>}
      </td>
    </tr>
  );
}
