'use client';
import { useState } from 'react';

interface Building {
  building_code: string;
  enabled: boolean;
  kitchen_wa_recipients: string[];
  delivery_sla_minutes: number;
  cancellation_grace_seconds: number;
  receipt_vat_line: string | null;
}

export function BuildingsForm({ initial }: { initial: Building[] }) {
  const [list, setList] = useState<Building[]>(initial);
  const [savingCode, setSavingCode] = useState<string | null>(null);

  function patch(code: string, patch: Partial<Building>) {
    setList(l => l.map(b => b.building_code === code ? { ...b, ...patch } : b));
  }

  async function save(b: Building) {
    setSavingCode(b.building_code);
    const res = await fetch(`/api/beithady/fnb/buildings/${b.building_code}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        enabled: b.enabled,
        kitchen_wa_recipients: b.kitchen_wa_recipients,
        delivery_sla_minutes: Number(b.delivery_sla_minutes),
        cancellation_grace_seconds: Number(b.cancellation_grace_seconds),
        receipt_vat_line: b.receipt_vat_line || null,
      }),
    });
    setSavingCode(null);
    if (res.ok) {
      const { building } = await res.json();
      setList(l => l.map(x => x.building_code === building.building_code ? building : x));
    } else {
      alert((await res.json().catch(() => ({}))).error || 'Save failed');
    }
  }

  return (
    <div className="space-y-3">
      {list.map(b => (
        <div key={b.building_code} className="ix-card p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">{b.building_code}</h3>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={b.enabled}
                onChange={e => patch(b.building_code, { enabled: e.target.checked })}
              />
              <span>F&amp;B enabled</span>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="col-span-2">
              <span className="block text-xs font-medium mb-1">
                Kitchen WhatsApp recipients (comma-separated, E.164)
              </span>
              <input
                value={(b.kitchen_wa_recipients ?? []).join(', ')}
                onChange={e => patch(b.building_code, {
                  kitchen_wa_recipients: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                })}
                placeholder="+201234567890, +201234567891"
                className="ix-input"
              />
            </label>
            <label>
              <span className="block text-xs font-medium mb-1">Delivery SLA (min)</span>
              <input
                type="number" min="5" max="180"
                value={b.delivery_sla_minutes}
                onChange={e => patch(b.building_code, { delivery_sla_minutes: Number(e.target.value) })}
                className="ix-input"
              />
            </label>
            <label>
              <span className="block text-xs font-medium mb-1">Cancellation grace (sec)</span>
              <input
                type="number" min="30" max="300"
                value={b.cancellation_grace_seconds}
                onChange={e => patch(b.building_code, { cancellation_grace_seconds: Number(e.target.value) })}
                className="ix-input"
              />
            </label>
            <label className="col-span-2">
              <span className="block text-xs font-medium mb-1">Receipt VAT line (optional override)</span>
              <input
                value={b.receipt_vat_line ?? ''}
                onChange={e => patch(b.building_code, { receipt_vat_line: e.target.value })}
                className="ix-input"
                placeholder="Tax Reg. #: 123-456-789"
              />
            </label>
          </div>
          <button
            onClick={() => save(b)}
            disabled={savingCode === b.building_code}
            className="ix-btn-primary px-3 py-1.5 mt-3 text-sm disabled:opacity-50"
          >{savingCode === b.building_code ? 'Saving…' : 'Save'}</button>
        </div>
      ))}
    </div>
  );
}
