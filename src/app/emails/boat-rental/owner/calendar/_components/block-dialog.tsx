'use client';

import { useState, useTransition } from 'react';
import { Lock, X, AlertTriangle, Loader2 } from 'lucide-react';
import { useToast } from '@/app/_components/toast';
import { hapticSuccess, hapticError } from '@/lib/haptics';
import { addOwnerBlocksAction, removeOwnerBlockAction } from '../../actions';

const REASON_OPTIONS = [
  { value: 'personal_use', label: 'Personal use' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'owner_trip', label: 'Owner trip' },
  { value: 'repair', label: 'Repair' },
  { value: 'other', label: 'Other' },
];

type Props = {
  boatId: string;
  initialDate: string | null;
  existingBlock?: { id: string; reason: string } | null;
  onClose: () => void;
};

export function OwnerBlockDialog({ boatId, initialDate, existingBlock, onClose }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  if (!initialDate) return null;

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      try {
        await addOwnerBlocksAction(formData);
        toast('Date(s) blocked', { kind: 'success' });
        hapticSuccess();
        onClose();
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to block';
        if (msg.startsWith('reservation_conflict:')) {
          setError(`Cannot block — boat already has reservation(s) on: ${msg.slice('reservation_conflict:'.length)}`);
        } else {
          setError(msg);
        }
        hapticError();
      }
    });
  }

  function onRemove(formData: FormData) {
    startTransition(async () => {
      try {
        await removeOwnerBlockAction(formData);
        toast('Block removed', { kind: 'success' });
        hapticSuccess();
        onClose();
      } catch (e) {
        toast(e instanceof Error ? e.message : 'Failed to remove', { kind: 'error' });
        hapticError();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md mx-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Lock size={16} className="text-slate-600 dark:text-slate-300" />
            <h3 className="font-semibold">{existingBlock ? 'Remove block' : 'Block date(s)'}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X size={16} />
          </button>
        </div>

        {existingBlock ? (
          <form action={onRemove} className="p-5 space-y-4">
            <input type="hidden" name="id" value={existingBlock.id} />
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {initialDate} is currently blocked ({existingBlock.reason.replace(/_/g, ' ')}). Removing the block makes
              this date available for brokers to reserve.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} disabled={pending} className="ix-btn-ghost">Cancel</button>
              <button type="submit" disabled={pending} className="ix-btn-danger">
                {pending ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                {pending ? 'Removing…' : 'Remove block'}
              </button>
            </div>
          </form>
        ) : (
          <form action={onSubmit} className="p-5 space-y-4">
            <input type="hidden" name="boat_id" value={boatId} />
            <div className="grid grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="text-slate-600 dark:text-slate-300 text-xs">From *</span>
                <input
                  name="from_date"
                  type="date"
                  required
                  defaultValue={initialDate}
                  className="ix-input mt-1"
                />
              </label>
              <label className="text-sm">
                <span className="text-slate-600 dark:text-slate-300 text-xs">To (optional)</span>
                <input
                  name="to_date"
                  type="date"
                  defaultValue={initialDate}
                  className="ix-input mt-1"
                />
              </label>
            </div>
            <label className="text-sm block">
              <span className="text-slate-600 dark:text-slate-300 text-xs">Reason *</span>
              <select name="reason" required className="ix-input mt-1">
                <option value="">Select reason…</option>
                {REASON_OPTIONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </label>
            <label className="text-sm block">
              <span className="text-slate-600 dark:text-slate-300 text-xs">Note (optional)</span>
              <input name="reason_note" className="ix-input mt-1" placeholder="Anything to add" />
            </label>
            {error && (
              <div className="text-xs text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded p-2 flex items-start gap-2">
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Range can be a single day or a contiguous span. Brokers will see &quot;Owner-reserved&quot; on these dates.
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} disabled={pending} className="ix-btn-ghost">Cancel</button>
              <button type="submit" disabled={pending} className="ix-btn-primary">
                {pending ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
                {pending ? 'Blocking…' : 'Block date(s)'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
