'use client';

import { useEffect, useId, useState } from 'react';
import {
  FMPLUS_ROLE_PRESETS,
  resolveFmplusPerms,
  type FmplusPerms,
  type FmplusRolePreset,
  type ResolvedFmplusPerms,
} from '@/lib/fmplus/setup/roles';

interface Props {
  /** Field name for the hidden `<input>` carrying the preset value. */
  nameRole:  string;
  /** Field name for the hidden `<input>` carrying the JSON-stringified FmplusPerms (empty string when Advanced is off). */
  namePerms: string;
  /** Initial preset value. */
  defaultRole:  FmplusRolePreset;
  /** Initial overrides (null/empty → Advanced toggle starts off). */
  defaultPerms: FmplusPerms | null;
}

const FINANCIALS_LEVELS:    Array<ResolvedFmplusPerms['financials']>    = ['none', 'view'];
const BUDGET_LEVELS:        Array<ResolvedFmplusPerms['budget']>        = ['none', 'view', 'edit'];
const PERFORMANCE_LEVELS:   Array<ResolvedFmplusPerms['performance']>   = ['none', 'view'];
const SHIFT_REPORTS_LEVELS: Array<ResolvedFmplusPerms['shift_reports']> = ['none', 'view', 'submit', 'configure'];

export function FmplusRolePicker({ nameRole, namePerms, defaultRole, defaultPerms }: Props) {
  const id = useId();
  const [role, setRole]           = useState<FmplusRolePreset>(defaultRole);
  const [advanced, setAdvanced]   = useState<boolean>(!!defaultPerms && Object.keys(defaultPerms).length > 0);
  const [perms, setPerms]         = useState<ResolvedFmplusPerms>(() => resolveFmplusPerms(defaultRole, defaultPerms));

  // When the preset changes AND Advanced is off, swap to the new preset's defaults.
  // When Advanced is on, keep the manually-set perms (user explicitly overrode).
  useEffect(() => {
    if (!advanced) {
      setPerms(resolveFmplusPerms(role, null));
    }
  }, [role, advanced]);

  // What we serialize to the hidden field:
  // - Advanced OFF → empty string (server treats as null, applies preset defaults at read time).
  // - Advanced ON  → JSON of ONLY the modules that differ from the preset.
  const presetDefaults = resolveFmplusPerms(role, null);
  const overrides: FmplusPerms = {};
  if (advanced) {
    if (perms.financials    !== presetDefaults.financials)    overrides.financials    = perms.financials;
    if (perms.budget        !== presetDefaults.budget)        overrides.budget        = perms.budget;
    if (perms.performance   !== presetDefaults.performance)   overrides.performance   = perms.performance;
    if (perms.shift_reports !== presetDefaults.shift_reports) overrides.shift_reports = perms.shift_reports;
    if (perms.setup         !== presetDefaults.setup)         overrides.setup         = perms.setup;
  }
  const permsJson = advanced && Object.keys(overrides).length > 0
    ? JSON.stringify(overrides)
    : '';

  return (
    <div className="space-y-2">
      <input type="hidden" name={nameRole}  value={role} />
      <input type="hidden" name={namePerms} value={permsJson} />

      <label className="block">
        <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
          FM+ Role <span className="text-rose-500">*</span>
        </span>
        <select
          value={role}
          onChange={(e) => setRole(e.target.value as FmplusRolePreset)}
          className="ix-input w-full"
        >
          {FMPLUS_ROLE_PRESETS.map((p) => (
            <option key={p.key} value={p.key}>{p.labelEn} ({p.labelAr})</option>
          ))}
        </select>
      </label>

      <label className="inline-flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200 cursor-pointer">
        <input
          type="checkbox"
          checked={advanced}
          onChange={(e) => {
            const next = e.target.checked;
            setAdvanced(next);
            if (!next) setPerms(resolveFmplusPerms(role, null));
          }}
        />
        Advanced (override preset)
      </label>

      {advanced && (
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-800/40 space-y-2">
          <MatrixRow id={`${id}-fin`} label="Financials">
            <select
              value={perms.financials}
              onChange={(e) => setPerms({ ...perms, financials: e.target.value as ResolvedFmplusPerms['financials'] })}
              className="ix-input !text-xs !py-1 w-32"
            >
              {FINANCIALS_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </MatrixRow>
          <MatrixRow id={`${id}-bud`} label="Budget">
            <select
              value={perms.budget}
              onChange={(e) => setPerms({ ...perms, budget: e.target.value as ResolvedFmplusPerms['budget'] })}
              className="ix-input !text-xs !py-1 w-32"
            >
              {BUDGET_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </MatrixRow>
          <MatrixRow id={`${id}-perf`} label="Performance">
            <select
              value={perms.performance}
              onChange={(e) => setPerms({ ...perms, performance: e.target.value as ResolvedFmplusPerms['performance'] })}
              className="ix-input !text-xs !py-1 w-32"
            >
              {PERFORMANCE_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </MatrixRow>
          <MatrixRow id={`${id}-shift`} label="Shift Reports">
            <select
              value={perms.shift_reports}
              onChange={(e) => setPerms({ ...perms, shift_reports: e.target.value as ResolvedFmplusPerms['shift_reports'] })}
              className="ix-input !text-xs !py-1 w-32"
            >
              {SHIFT_REPORTS_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </MatrixRow>
          <MatrixRow id={`${id}-setup`} label="Setup">
            <label className="inline-flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={perms.setup}
                onChange={(e) => setPerms({ ...perms, setup: e.target.checked })}
              />
              {perms.setup ? 'Yes' : 'No'}
            </label>
          </MatrixRow>
          <button
            type="button"
            onClick={() => setPerms(resolveFmplusPerms(role, null))}
            className="text-[11px] text-fmplus-gold hover:text-fmplus-yellow underline"
          >
            Reset to preset defaults
          </button>
        </div>
      )}
    </div>
  );
}

function MatrixRow({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-xs font-medium text-slate-700 dark:text-slate-200">{label}</label>
      <div id={id}>{children}</div>
    </div>
  );
}
