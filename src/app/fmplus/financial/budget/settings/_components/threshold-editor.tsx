'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save } from 'lucide-react';
import { saveSettingsAction } from '../actions';

interface SettingsState {
  green_pct: number;
  amber_pct: number;
  default_scenario: 'initial' | 'revised' | 'reforecast';
  default_inflation_revenue: number;
  default_inflation_manpower: number;
  default_inflation_other: number;
  default_mob_amortization_months: number;
  bilingual_default: 'en' | 'ar';
}

interface Props {
  initial: SettingsState;
  canEdit: boolean;
}

export function ThresholdEditor({ initial, canEdit }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [s, setS] = useState<SettingsState>(initial);

  const update = <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => {
    setS(prev => ({ ...prev, [key]: value }));
    setOk(false);
  };

  const onSave = () => {
    if (!canEdit) return;
    setError(null);
    setOk(false);
    if (s.green_pct >= s.amber_pct) {
      setError('Green threshold must be lower than amber threshold.');
      return;
    }
    startTransition(async () => {
      try {
        await saveSettingsAction(s);
        setOk(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Variance thresholds (asymmetric)</h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
          <code>|var%|</code> ≤ green → <span className="text-green-400">green</span> ·
          var% &gt; amber → <span className="text-red-400">red</span> (overspend) ·
          everything else → <span className="text-amber-400">amber</span> (incl. underspend &gt; green).
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Green ≤ (%)" value={s.green_pct} onChange={v => update('green_pct', v)} disabled={!canEdit || isPending} />
          <Field label="Amber ≤ (%)" value={s.amber_pct} onChange={v => update('amber_pct', v)} disabled={!canEdit || isPending} />
          <div>
            <label className="block">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Default scenario</span>
              <select value={s.default_scenario}
                onChange={e => update('default_scenario', e.currentTarget.value as 'initial' | 'revised' | 'reforecast')}
                disabled={!canEdit || isPending}
                className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 mt-1 disabled:opacity-50">
                <option value="initial">Initial</option>
                <option value="revised">Revised</option>
                <option value="reforecast">Reforecast</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Default inflation knobs</h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-3">
          Pre-fill values for the Copy Y1 → Y2 dialog. Per-contract overrides happen in the dialog.
        </p>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Revenue %" value={s.default_inflation_revenue} onChange={v => update('default_inflation_revenue', v)} disabled={!canEdit || isPending} />
          <Field label="Manpower CTC %" value={s.default_inflation_manpower} onChange={v => update('default_inflation_manpower', v)} disabled={!canEdit || isPending} />
          <Field label="Non-manpower %" value={s.default_inflation_other} onChange={v => update('default_inflation_other', v)} disabled={!canEdit || isPending} />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">Mobilization defaults</h3>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Amortization months" value={s.default_mob_amortization_months} onChange={v => update('default_mob_amortization_months', Math.round(v))} disabled={!canEdit || isPending} integer />
          <div>
            <label className="block">
              <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Bilingual default</span>
              <select value={s.bilingual_default}
                onChange={e => update('bilingual_default', e.currentTarget.value as 'en' | 'ar')}
                disabled={!canEdit || isPending}
                className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 mt-1 disabled:opacity-50">
                <option value="en">English (LTR)</option>
                <option value="ar">العربية (RTL)</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
      {ok && <p className="text-xs text-green-400">Saved.</p>}

      <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-700">
        <button type="button" onClick={onSave} disabled={!canEdit || isPending}
          className="text-xs px-4 py-1.5 bg-indigo-600 text-white rounded font-semibold flex items-center gap-1 disabled:opacity-50">
          <Save size={12} /> {isPending ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </section>
  );
}

function Field({ label, value, onChange, disabled, integer }: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled: boolean;
  integer?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">{label}</span>
      <input type="number" min="0" max={integer ? 120 : 100} step={integer ? 1 : 0.1}
        value={value}
        onChange={e => onChange(Number(e.currentTarget.value) || 0)}
        disabled={disabled}
        className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 mt-1 text-right tabular-nums disabled:opacity-50" />
    </label>
  );
}
