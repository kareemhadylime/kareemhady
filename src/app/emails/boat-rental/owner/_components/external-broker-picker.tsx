'use client';

import { useState } from 'react';
import { addExternalBrokerAction } from '../actions';

type Broker = { id: string; name: string; phone: string | null };

export function ExternalBrokerPicker({
  initial,
  fieldName,
}: {
  initial: Broker[];
  fieldName: string; // e.g. 'external_broker_id'
}) {
  const [list, setList] = useState<Broker[]>(initial);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [selectedId, setSelectedId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  async function onAdd() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set('name', newName);
      if (newPhone) fd.set('phone', newPhone);
      const created = await addExternalBrokerAction(fd);
      const updated = [
        { ...created, phone: newPhone || null },
        ...list.filter((b) => b.id !== created.id),
      ];
      setList(updated);
      setSelectedId(created.id);
      setAdding(false);
      setNewName('');
      setNewPhone('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <select
        name={fieldName}
        value={selectedId}
        onChange={(e) => {
          if (e.target.value === '__add__') {
            setAdding(true);
          } else {
            setSelectedId(e.target.value);
          }
        }}
        className="ix-input"
      >
        <option value="">Select broker…</option>
        {list.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
        <option value="__add__">+ Add new broker…</option>
      </select>
      {adding && (
        <div className="flex flex-wrap gap-2 items-center bg-slate-50 p-2 rounded">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Name"
            className="ix-input flex-1 min-w-[140px]"
          />
          <input
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="Phone (optional)"
            className="ix-input flex-1 min-w-[140px]"
          />
          <button
            type="button"
            disabled={busy || !newName.trim()}
            onClick={onAdd}
            className="ix-btn-primary text-xs disabled:opacity-60"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setAdding(false)}
            className="text-xs text-slate-500 hover:text-slate-800"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
