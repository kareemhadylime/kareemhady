'use client';

import { useTransition, useState } from 'react';
import { Power, Trash2 } from 'lucide-react';
import type { ConsumptionRuleListRow } from '@/lib/beithady/inventory/rules-shared';
import { toggleRuleActiveAction, deleteRuleAction } from '../actions';
import { RuleFormButton } from './rule-form-button';

type ItemOpt = {
  id: string;
  label: string;
  pack_volume_value: number | null;
  pack_volume_uom: string | null;
};
type BuildingOpt = { code: string; label: string };

export function RuleRowActions({
  rule, items, buildings,
}: {
  rule: ConsumptionRuleListRow;
  items: ItemOpt[];
  buildings: BuildingOpt[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setError(res.error || 'Action failed');
    });
  }

  return (
    <div className="inline-flex items-center gap-1">
      <RuleFormButton
        mode="edit"
        existing={rule}
        items={items}
        buildings={buildings}
        triggerLabel="Edit"
        triggerClass="text-[11px] text-cyan-700 hover:text-cyan-900 hover:underline px-1.5"
      />
      <button
        type="button"
        onClick={() => run(() => toggleRuleActiveAction(rule.id))}
        disabled={pending}
        className={`text-[11px] inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded disabled:opacity-50 ${rule.active ? 'text-rose-700 hover:bg-rose-50' : 'text-emerald-700 hover:bg-emerald-50'}`}
        title={rule.active ? 'Disable this rule' : 'Enable this rule'}
      >
        <Power size={11} />
      </button>
      <button
        type="button"
        onClick={() => run(() => deleteRuleAction(rule.id), 'Delete this rule? This is permanent — past auto-issues are unaffected.')}
        disabled={pending}
        className="text-[11px] text-rose-700 hover:text-rose-900 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded hover:bg-rose-50 disabled:opacity-50"
        title="Delete rule"
      >
        <Trash2 size={11} />
      </button>
      {error && <span className="text-[10px] text-rose-700 ml-2">{error}</span>}
    </div>
  );
}
