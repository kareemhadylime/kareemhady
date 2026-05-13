'use client';
import { useState, useMemo } from 'react';
import type { HKBaseData, HKInputs, BuildingKey } from '@/lib/beithady/hc-estimator-types';
import { BUILDINGS } from '@/lib/beithady/hc-estimator-types';
import { calculateHKWeeks } from '@/lib/beithady/hk-calc';
import { HKActualsTable } from './hk-actuals-table';
import { HKDashboard } from './hk-dashboard';
import { HKWeeklyTable } from './hk-weekly-table';

const DEFAULT_INPUTS: HKInputs = {
  multiplier: 1,
  buildings: {
    'BH-26':  { generalAreaHrsPerDay: 0, nightShiftHKs: 0 },
    'BH-73':  { generalAreaHrsPerDay: 0, nightShiftHKs: 0 },
    'BH-435': { generalAreaHrsPerDay: 0, nightShiftHKs: 0 },
    'BH-OK':  { generalAreaHrsPerDay: 0, nightShiftHKs: 0 },
  },
};

const PRESETS = [1.5, 2, 2.5, 3];

export function HKCalculator({ base }: { base: HKBaseData }) {
  const [inputs, setInputs] = useState<HKInputs>(DEFAULT_INPUTS);

  const setMultiplier = (v: number) =>
    setInputs(prev => ({ ...prev, multiplier: Math.max(0.1, v) }));

  const setBuildingInput = (
    building: BuildingKey,
    field: 'generalAreaHrsPerDay' | 'nightShiftHKs',
    value: number,
  ) =>
    setInputs(prev => ({
      ...prev,
      buildings: {
        ...prev.buildings,
        [building]: { ...prev.buildings[building], [field]: Math.max(0, value) },
      },
    }));

  const result = useMemo(() => calculateHKWeeks(base, inputs), [base, inputs]);

  const totalActual =
    base.totalCheckins.studio + base.totalCheckins.oneBR +
    base.totalCheckins.twoBR + base.totalCheckins.threeBR + base.totalCheckins.fourBR;
  const projectedTotal = Math.round(totalActual * inputs.multiplier);

  return (
    <div className="space-y-6">
      {/* Input panel */}
      <div className="ix-card p-4 space-y-4">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Settings</h3>

        {/* Multiplier */}
        <div className="space-y-1">
          <label className="text-xs text-slate-500 uppercase tracking-wide">Projection Multiplier</label>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="number"
              min={0.1}
              step={0.1}
              value={inputs.multiplier}
              onChange={e => setMultiplier(parseFloat(e.target.value) || 1)}
              className="w-20 px-2 py-1.5 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800"
            />
            {PRESETS.map(p => (
              <button
                key={p}
                onClick={() => setMultiplier(p)}
                className={`px-2.5 py-1 text-xs rounded-lg border transition ${
                  inputs.multiplier === p
                    ? 'bg-cyan-600 text-white border-cyan-600'
                    : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-cyan-400'
                }`}
              >
                ×{p}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-400">
            {totalActual} checkins last month → <span className="font-semibold text-cyan-600">{projectedTotal} projected</span>
          </p>
        </div>

        {/* Per-building inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {BUILDINGS.map(b => (
            <div key={b} className="space-y-2 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{b}</p>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500">Areas hrs/day</label>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={inputs.buildings[b].generalAreaHrsPerDay}
                  onChange={e => setBuildingInput(b, 'generalAreaHrsPerDay', parseFloat(e.target.value) || 0)}
                  className="w-full px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-slate-500">Night shift HKs</label>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={inputs.buildings[b].nightShiftHKs}
                  onChange={e => setBuildingInput(b, 'nightShiftHKs', parseInt(e.target.value) || 0)}
                  className="w-full px-2 py-1 text-sm border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actuals reference */}
      <HKActualsTable base={base} projectedTotal={projectedTotal} />

      {/* Dashboard + table */}
      <HKDashboard result={result} />
      <HKWeeklyTable result={result} />
    </div>
  );
}
