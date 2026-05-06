'use client';
import { useEffect, useState } from 'react';
import type { Item, BuildingOverride } from '@/lib/beithady/fnb/types';

const BUILDINGS = ['BH-26', 'BH-73', 'BH-435', 'BH-OK', 'BH-34'] as const;

export function AvailabilityForm({
  item, onSaved,
}: { item: Item; onSaved: (item: Item) => void }) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [hoursStart, setHoursStart] = useState(item.hours_start_override ?? '');
  const [hoursEnd, setHoursEnd] = useState(item.hours_end_override ?? '');
  const [enabled, setEnabled] = useState(item.enabled);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/beithady/fnb/items/${item.id}/availability`)
      .then(r => r.json())
      .then((d: { overrides: BuildingOverride[] }) => {
        const map: Record<string, boolean> = {};
        d.overrides.forEach(o => { map[o.building_code] = o.is_out_of_stock; });
        setOverrides(map);
      });
  }, [item.id]);

  async function save() {
    setSaving(true);
    const res = await fetch(
      `/api/beithady/fnb/items/${item.id}/availability`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hours_start_override: hoursStart || null,
          hours_end_override: hoursEnd || null,
          enabled,
          building_overrides: BUILDINGS.map(b => ({
            building_code: b,
            is_out_of_stock: !!overrides[b],
          })),
        }),
      },
    );
    setSaving(false);
    if (res.ok) {
      const itemRes = await fetch(`/api/beithady/fnb/items/${item.id}`);
      onSaved((await itemRes.json()).item);
    }
  }

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={e => setEnabled(e.target.checked)}
        />
        <span className="text-sm">Item enabled (visible on guest menu)</span>
      </label>
      <fieldset className="border rounded p-3">
        <legend className="text-xs font-semibold uppercase tracking-wide">
          Hours override (optional)
        </legend>
        <p className="text-xs text-slate-500 mb-2">
          Leave blank to inherit category default. Format HH:MM (24h).
        </p>
        <div className="grid grid-cols-2 gap-2">
          <input
            className="ix-input" placeholder="08:00"
            value={hoursStart}
            onChange={e => setHoursStart(e.target.value)}
          />
          <input
            className="ix-input" placeholder="14:00"
            value={hoursEnd}
            onChange={e => setHoursEnd(e.target.value)}
          />
        </div>
      </fieldset>
      <fieldset className="border rounded p-3">
        <legend className="text-xs font-semibold uppercase tracking-wide">
          Stock-out per building
        </legend>
        <div className="grid grid-cols-5 gap-2">
          {BUILDINGS.map(b => (
            <label
              key={b}
              className="flex flex-col items-center gap-1 p-2 border rounded"
            >
              <span className="text-xs font-medium">{b}</span>
              <input
                type="checkbox"
                checked={!!overrides[b]}
                onChange={e =>
                  setOverrides(o => ({ ...o, [b]: e.target.checked }))
                }
              />
              <span className="text-[10px] text-slate-500">
                {overrides[b] ? 'OUT' : 'OK'}
              </span>
            </label>
          ))}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          Auto-clears at next Cairo midnight via cron.
        </p>
      </fieldset>
      <button
        onClick={save}
        disabled={saving}
        className="ix-btn-primary px-4 py-2 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save availability'}
      </button>
    </div>
  );
}
