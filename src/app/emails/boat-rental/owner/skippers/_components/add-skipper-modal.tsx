'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { addSkipperAction } from '../actions';

type Boat = { id: string; name: string };

export function AddSkipperModal({ boats }: { boats: Boat[] }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="ix-btn-primary inline-flex items-center gap-1"
      >
        <Plus size={14} /> Add skipper
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
      <div className="ix-card max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <h2 className="text-lg font-semibold">Add skipper</h2>
          <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>
        <form action={addSkipperAction} className="space-y-3">
          <label className="block text-sm">
            <span className="text-slate-600 text-xs">Boat *</span>
            <select name="boat_id" required className="ix-input mt-1">
              {boats.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600 text-xs">Name *</span>
            <input name="name" required className="ix-input mt-1" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600 text-xs">WhatsApp (digits only, no +) *</span>
            <input name="whatsapp" required pattern="\d{8,15}" className="ix-input mt-1" placeholder="201001234567" />
          </label>
          <label className="block text-sm">
            <span className="text-slate-600 text-xs">Notes</span>
            <input name="notes" className="ix-input mt-1" />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_default" />
            <span>Set as default for this boat</span>
          </label>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => setOpen(false)} className="ix-btn-secondary">Cancel</button>
            <button type="submit" className="ix-btn-primary">Add</button>
          </div>
        </form>
      </div>
    </div>
  );
}
