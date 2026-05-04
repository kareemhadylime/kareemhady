'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { X, Save, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { copyYearAction } from '../actions';
import { applyInflation, type InflationKnobs } from '@/lib/fmplus/budget/inflation-calc';

interface SourceLine {
  id: number;
  line_code: string;
  service_line: 'hk' | 'mep' | 'landscape' | 'security' | 'pest_ctrl' | 'waste_mgmt' | 'back_office';
  category: 'manning' | 'ppe' | 'tools' | 'consumables' | 'transport' | 'it' | 'governmental' | 'other';
  label_en: string;
  label_ar: string | null;
  qty: number;
  unit_cost: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  sourceYearId: number;
  sourceYearIndex: number;
  targetYearIndex: number;
  contractName: string;
  defaultKnobs: InflationKnobs;
}

export function CopyYearDialog({
  open,
  onClose,
  sourceYearId,
  sourceYearIndex,
  targetYearIndex,
  contractName,
  defaultKnobs,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [knobs, setKnobs] = useState<InflationKnobs>(defaultKnobs);
  const [perLinePct, setPerLinePct] = useState<Record<string, number>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [lines, setLines] = useState<SourceLine[]>([]);
  const [annualRevenue, setAnnualRevenue] = useState<number>(0);
  const [tweakOpen, setTweakOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);

  // Reset knobs when dialog opens so defaults are fresh
  useEffect(() => {
    if (open) {
      setKnobs(defaultKnobs);
      setPerLinePct({});
      setReasons({});
      setTweakOpen(false);
      setFilter('');
      setError(null);
    }
  }, [open, defaultKnobs]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError(null);
    fetch(`/api/fmplus/budget/year-lines?year_id=${sourceYearId}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setLines(data.lines as SourceLine[]);
        setAnnualRevenue(Number(data.annualRevenue) || 0);
      })
      .catch(e => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [open, sourceYearId]);

  if (!open) return null;

  // Derived projections
  const sourceCost = lines.reduce((a, l) => a + l.qty * l.unit_cost * 12, 0);
  const targetCost = lines.reduce((a, l) => {
    const inflated = applyInflation(
      { line_code: l.line_code, service_line: l.service_line, category: l.category, qty: l.qty, unit_cost: l.unit_cost },
      knobs,
      perLinePct,
    );
    return a + inflated.qty * inflated.unit_cost * 12;
  }, 0);
  const targetRevenue = annualRevenue * (1 + knobs.revenue / 100);
  const sourceGm = annualRevenue > 0 ? ((annualRevenue - sourceCost) / annualRevenue * 100) : 0;
  const targetGm = targetRevenue > 0 ? ((targetRevenue - targetCost) / targetRevenue * 100) : 0;
  const overrideCount = Object.keys(perLinePct).length;
  const filteredLines = filter
    ? lines.filter(l =>
        l.line_code.toLowerCase().includes(filter.toLowerCase()) ||
        l.label_en.toLowerCase().includes(filter.toLowerCase()))
    : lines;

  const onCommit = () => {
    setError(null);
    startTransition(async () => {
      try {
        const result = await copyYearAction({
          source_year_id: sourceYearId,
          target_year_index: targetYearIndex,
          knobs,
          per_line_override_pct: perLinePct,
          reasons,
        });
        // Navigate to the new year
        router.push(`/fmplus/financial/budget/edit?contract=${(result as any).contract_id ?? ''}&year=${result.year_index}`);
        router.refresh();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-bg-primary border border-border rounded-lg max-w-3xl w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border bg-bg-tertiary">
          <div>
            <strong className="text-sm text-text-primary">
              Copy Y{sourceYearIndex} → Y{targetYearIndex} with inflation
            </strong>
            <div className="text-[11px] text-text-secondary mt-0.5">
              {contractName} · {lines.length} lines + revenue carry-over
            </div>
          </div>
          <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        {/* Source/target summary */}
        <div className="p-3 bg-bg-secondary border-b border-border grid grid-cols-[1fr_auto_1fr] gap-3 items-center text-xs">
          <div>
            <div className="text-[10px] text-text-secondary uppercase mb-0.5">Source Y{sourceYearIndex}</div>
            <div className="font-semibold text-text-primary tabular-nums">
              {(annualRevenue / 1_000_000).toFixed(2)} M rev · {(sourceCost / 1_000_000).toFixed(2)} M cost · {sourceGm.toFixed(1)}% GM
            </div>
          </div>
          <div className="text-2xl text-accent">→</div>
          <div>
            <div className="text-[10px] text-text-secondary uppercase mb-0.5">
              Target Y{targetYearIndex} <span className="text-amber-400">(projected)</span>
            </div>
            <div className="font-semibold text-text-primary tabular-nums">
              <span className="text-green-400">{(targetRevenue / 1_000_000).toFixed(2)} M rev</span>
              {' · '}{(targetCost / 1_000_000).toFixed(2)} M cost
              {' · '}<span className={targetGm > sourceGm ? 'text-green-400' : 'text-amber-400'}>{targetGm.toFixed(1)}% GM</span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Inflation knobs */}
          <div>
            <div className="text-[10px] text-text-secondary uppercase font-semibold mb-2">
              Uniform inflation (defaults from Settings)
            </div>
            <div className="grid grid-cols-3 gap-3">
              {([
                ['revenue', 'Revenue', '💰', 'text-green-400'],
                ['manpower', 'Manpower CTC', '👥', 'text-accent'],
                ['other', 'Non-manpower', '📦', 'text-amber-400'],
              ] as const).map(([key, label, icon, colorClass]) => (
                <div key={key} className="bg-bg-tertiary border border-border rounded p-3">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-xs text-text-primary font-semibold">{icon} {label}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min="0"
                      max="50"
                      step="0.5"
                      value={knobs[key]}
                      onChange={e => setKnobs(prev => ({ ...prev, [key]: Number(e.currentTarget.value) || 0 }))}
                      className={`flex-1 text-right text-lg font-bold bg-bg-secondary border border-border rounded px-2 py-1 tabular-nums ${colorClass}`}
                    />
                    <span className="text-base text-text-secondary font-semibold">%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="25"
                    step="0.5"
                    value={knobs[key]}
                    onChange={e => setKnobs(prev => ({ ...prev, [key]: Number(e.currentTarget.value) }))}
                    className="w-full mt-2 accent-accent"
                  />
                </div>
              ))}
            </div>
            <p className="text-[10px] text-text-secondary italic mt-2">
              Per-contract override only — Settings defaults stay untouched.
            </p>
          </div>

          {/* Tweak per line */}
          <div className="bg-blue-500/5 border border-border rounded p-3">
            <button
              type="button"
              onClick={() => setTweakOpen(o => !o)}
              className="flex items-center justify-between w-full"
            >
              <span className="text-xs font-semibold text-text-primary inline-flex items-center gap-1">
                {tweakOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                Tweak per line
                {overrideCount > 0 && (
                  <span className="text-[10px] text-accent font-semibold">· {overrideCount} overridden</span>
                )}
              </span>
              {tweakOpen && (
                <span className="relative" onClick={e => e.stopPropagation()}>
                  <Search size={11} className="absolute left-1.5 top-1/2 -translate-y-1/2 text-text-secondary pointer-events-none" />
                  <input
                    type="search"
                    placeholder="Find line..."
                    value={filter}
                    onChange={e => setFilter(e.currentTarget.value)}
                    className="pl-6 pr-2 py-0.5 text-xs bg-bg-secondary border border-border rounded w-40"
                  />
                </span>
              )}
            </button>

            {tweakOpen && (
              <div className="mt-3 max-h-[280px] overflow-y-auto">
                {loading && <p className="text-[11px] text-text-secondary">Loading lines…</p>}
                {!loading && filteredLines.length === 0 && (
                  <p className="text-[11px] text-text-secondary">No lines found.</p>
                )}
                {!loading && filteredLines.length > 0 && (
                  <table className="w-full text-[11px]">
                    <thead className="text-[9px] text-text-secondary uppercase border-b border-border text-left sticky top-0 bg-bg-tertiary">
                      <tr>
                        <th className="px-1 py-1.5">Line</th>
                        <th className="px-1 py-1.5 text-right w-20">Y{sourceYearIndex} mo</th>
                        <th className="px-1 py-1.5 text-center w-20">% override</th>
                        <th className="px-1 py-1.5 text-right w-20">Y{targetYearIndex} mo</th>
                        <th className="px-1 py-1.5 w-32">Reason</th>
                      </tr>
                    </thead>
                    <tbody className="text-text-primary">
                      {filteredLines.map((l) => {
                        const inflated = applyInflation(
                          { line_code: l.line_code, service_line: l.service_line, category: l.category, qty: l.qty, unit_cost: l.unit_cost },
                          knobs,
                          perLinePct,
                        );
                        const monthlySource = l.qty * l.unit_cost;
                        const monthlyTarget = inflated.qty * inflated.unit_cost;
                        const isOverridden = perLinePct[l.line_code] !== undefined;
                        return (
                          <tr key={l.line_code} className={`border-b border-border ${isOverridden ? 'bg-amber-500/5' : ''}`}>
                            <td className="px-1 py-1.5">
                              <span className="text-[9px] text-text-secondary">{l.service_line.toUpperCase()}/{l.category}</span>
                              <div className="font-medium">{l.label_en}</div>
                            </td>
                            <td className="px-1 py-1.5 text-right tabular-nums text-text-secondary">
                              {monthlySource.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </td>
                            <td className="px-1 py-1.5 text-center">
                              <input
                                type="number"
                                step="0.5"
                                placeholder="—"
                                value={perLinePct[l.line_code] ?? ''}
                                onChange={e => {
                                  const v = e.currentTarget.value;
                                  setPerLinePct(prev => {
                                    const next = { ...prev };
                                    if (v === '') delete next[l.line_code];
                                    else next[l.line_code] = Number(v);
                                    return next;
                                  });
                                }}
                                className={`w-14 px-1 py-0.5 text-right text-[11px] bg-bg-secondary border border-border rounded tabular-nums ${isOverridden ? 'text-amber-400 font-semibold' : ''}`}
                              />
                              {!isOverridden && (
                                <span className="text-[9px] text-text-secondary ml-1">uniform</span>
                              )}
                            </td>
                            <td className={`px-1 py-1.5 text-right tabular-nums ${isOverridden ? 'text-amber-400 font-semibold' : ''}`}>
                              {monthlyTarget.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                            </td>
                            <td className="px-1 py-1.5">
                              <input
                                type="text"
                                placeholder="reason..."
                                value={reasons[l.line_code] ?? ''}
                                onChange={e => setReasons(prev => ({ ...prev, [l.line_code]: e.currentTarget.value }))}
                                disabled={!isOverridden}
                                className="w-full text-[10px] px-1 py-0.5 bg-bg-secondary border border-border rounded disabled:opacity-30"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border bg-bg-tertiary flex items-center justify-between gap-2 flex-wrap">
          {error && <span className="text-xs text-red-400 flex-1">{error}</span>}
          {!error && (
            <span className="text-[10px] text-text-secondary flex-1">
              Knobs + {overrideCount} per-line override{overrideCount === 1 ? '' : 's'} will be written to budget_audit on commit.
            </span>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={isPending}
              className="text-xs px-3 py-1.5 text-text-secondary border border-border rounded hover:bg-bg-secondary disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onCommit}
              disabled={isPending || lines.length === 0}
              className="text-xs px-4 py-1.5 bg-accent text-white rounded font-semibold flex items-center gap-1 disabled:opacity-50"
            >
              <Save size={12} />
              {isPending
                ? 'Copying…'
                : `Commit Y${targetYearIndex} (${lines.length} lines${overrideCount > 0 ? ` + ${overrideCount} tweaks` : ''})`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
