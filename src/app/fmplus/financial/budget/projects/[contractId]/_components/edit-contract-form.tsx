'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Save, Plus, Trash2, AlertTriangle } from 'lucide-react';
import type { ServiceLine } from '@/lib/fmplus/budget/types';
import { updateContractAction, addServiceLineAction, deleteContractAction } from '../../actions';

const SERVICE_LABELS: Record<ServiceLine, string> = {
  hk: 'Housekeeping',
  mep: 'MEP',
  landscape: 'Landscape',
  security: 'Security',
  pest_ctrl: 'Pest Control',
  waste_mgmt: 'Waste Mgmt',
  back_office: 'Back Office',
};

interface ContractDraft {
  id: number;
  name: string;
  customer: string | null;
  start_date: string;
  end_date: string;
  contract_value: number;
  vat_pct: number;
  year_tracking: 'contract' | 'fiscal';
  zones: string[];
  notes: string | null;
}

interface Props {
  contract: ContractDraft;
  services: ServiceLine[];
  availableServices: ServiceLine[];
  canEdit: boolean;
  hasYears: boolean;
}

export function EditContractForm({ contract, services, availableServices, canEdit, hasYears }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [addingService, setAddingService] = useState<ServiceLine | ''>('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  const onSave = (formData: FormData) => {
    if (!canEdit) return;
    setError(null);
    setOk(false);
    startTransition(async () => {
      try {
        await updateContractAction(formData);
        setOk(true);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const onAddService = () => {
    if (!canEdit || !addingService) return;
    setError(null);
    startTransition(async () => {
      try {
        const result = await addServiceLineAction({
          contract_id: contract.id,
          service_line: addingService,
        });
        if (!result.added) {
          setError(result.reason ?? 'Could not add service');
        } else {
          setAddingService('');
          router.refresh();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  const onDelete = () => {
    if (!canEdit) return;
    if (deleteConfirmText !== contract.name) {
      setError(`Type "${contract.name}" exactly to confirm deletion.`);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await deleteContractAction(contract.id);
        // redirects server-side; this code unreachable
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  };

  return (
    <>
      {/* Edit form */}
      <form action={onSave} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-5 space-y-4">
        <input type="hidden" name="contract_id" value={contract.id} />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Contract metadata</h3>

        <label className="block">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Name</span>
          <input name="name" required defaultValue={contract.name}
            disabled={!canEdit || isPending}
            className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 mt-0.5 text-slate-900 dark:text-slate-100 disabled:opacity-50" />
        </label>

        <label className="block">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Customer</span>
          <input name="customer" defaultValue={contract.customer ?? ''}
            disabled={!canEdit || isPending}
            className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 mt-0.5 text-slate-900 dark:text-slate-100 disabled:opacity-50" />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Start date</span>
            <input name="start_date" type="date" required defaultValue={contract.start_date}
              disabled={!canEdit || isPending}
              className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 mt-0.5 text-slate-900 dark:text-slate-100 disabled:opacity-50" />
          </label>
          <label className="block">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">End date</span>
            <input name="end_date" type="date" required defaultValue={contract.end_date}
              disabled={!canEdit || isPending}
              className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 mt-0.5 text-slate-900 dark:text-slate-100 disabled:opacity-50" />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Contract value (EGP)</span>
            <input name="contract_value" type="number" min="0" step="0.01" defaultValue={contract.contract_value}
              disabled={!canEdit || isPending}
              className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 mt-0.5 text-right tabular-nums text-slate-900 dark:text-slate-100 disabled:opacity-50" />
          </label>
          <label className="block">
            <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">VAT %</span>
            <input name="vat_pct" type="number" min="0" max="100" step="0.1" defaultValue={contract.vat_pct}
              disabled={!canEdit || isPending}
              className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 mt-0.5 text-right tabular-nums text-slate-900 dark:text-slate-100 disabled:opacity-50" />
          </label>
        </div>

        <fieldset disabled={!canEdit || isPending} className="space-y-1.5">
          <legend className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Year tracking</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="year_tracking" value="contract" defaultChecked={contract.year_tracking === 'contract'} />
            <span className="text-slate-900 dark:text-slate-100"><strong>Contract-anchored</strong> — Y1/Y2 align to contract dates</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="year_tracking" value="fiscal" defaultChecked={contract.year_tracking === 'fiscal'} />
            <span className="text-slate-900 dark:text-slate-100"><strong>Fiscal-year</strong> — years align to calendar fiscal years</span>
          </label>
        </fieldset>

        <label className="block">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Zones (comma-separated, optional)</span>
          <input name="zones" defaultValue={contract.zones.join(', ')}
            placeholder="e.g. Zone A, Zone B"
            disabled={!canEdit || isPending}
            className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 mt-0.5 text-slate-900 dark:text-slate-100 disabled:opacity-50" />
        </label>

        <label className="block">
          <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase">Notes</span>
          <textarea name="notes" defaultValue={contract.notes ?? ''} rows={2}
            disabled={!canEdit || isPending}
            className="w-full text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 mt-0.5 text-slate-900 dark:text-slate-100 disabled:opacity-50 resize-y" />
        </label>

        {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        {ok && <p className="text-xs text-emerald-600 dark:text-emerald-400">Saved.</p>}

        {canEdit && (
          <div className="flex justify-end pt-2 border-t border-slate-200 dark:border-slate-700">
            <button type="submit" disabled={isPending}
              className="text-xs px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold flex items-center gap-1 disabled:opacity-50">
              <Save size={12} /> {isPending ? 'Saving…' : 'Save metadata'}
            </button>
          </div>
        )}
      </form>

      {/* Service-line manager */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg p-5 space-y-3">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Service lines ({services.length})</h3>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Add a new service line to this contract. Empty year-services rows are auto-created for every existing year.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {services.map(sl => (
            <span key={sl} className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-100 dark:bg-green-500/15 text-emerald-700 dark:text-green-400 border border-emerald-200 dark:border-green-500/30">
              {SERVICE_LABELS[sl]}
            </span>
          ))}
        </div>
        {canEdit && availableServices.length > 0 && (
          <div className="flex gap-2 items-center">
            <select value={addingService} onChange={e => setAddingService(e.currentTarget.value as ServiceLine | '')}
              disabled={isPending}
              className="text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-slate-900 dark:text-slate-100 disabled:opacity-50">
              <option value="">— Pick a service line —</option>
              {availableServices.map(sl => (
                <option key={sl} value={sl}>{SERVICE_LABELS[sl]}</option>
              ))}
            </select>
            <button type="button" onClick={onAddService} disabled={!addingService || isPending}
              className="text-xs px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold flex items-center gap-1 disabled:opacity-50">
              <Plus size={11} /> Add
            </button>
          </div>
        )}
        {availableServices.length === 0 && (
          <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">All 7 service lines are already on this contract.</p>
        )}
      </section>

      {/* Danger zone */}
      {canEdit && (
        <section className="bg-white dark:bg-slate-900 border border-red-200 dark:border-red-900 rounded-lg p-5 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-600 dark:text-red-400" />
            <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">Danger zone</h3>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Permanently delete this contract and ALL of its data: years, services, lines, mobilization, audit log, catalog overrides.
            {hasYears && <span className="text-amber-600 dark:text-amber-400"> This contract has years with data — deletion is irreversible.</span>}
          </p>
          {!confirmDelete ? (
            <button type="button" onClick={() => setConfirmDelete(true)}
              className="text-xs px-3 py-1.5 bg-red-50 dark:bg-red-950 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-900 rounded font-semibold flex items-center gap-1 hover:bg-red-100 dark:hover:bg-red-900">
              <Trash2 size={11} /> Delete this contract…
            </button>
          ) : (
            <div className="space-y-2 bg-red-50 dark:bg-red-950/40 p-3 rounded border border-red-200 dark:border-red-900">
              <p className="text-[11px] text-red-700 dark:text-red-300">
                Type <strong className="font-mono">{contract.name}</strong> to confirm:
              </p>
              <input value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.currentTarget.value)}
                disabled={isPending}
                className="w-full text-sm bg-white dark:bg-slate-900 border border-red-300 dark:border-red-800 rounded px-2 py-1.5 text-slate-900 dark:text-slate-100 disabled:opacity-50" />
              <div className="flex gap-2">
                <button type="button" onClick={() => { setConfirmDelete(false); setDeleteConfirmText(''); setError(null); }}
                  disabled={isPending}
                  className="text-xs px-3 py-1.5 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded">
                  Cancel
                </button>
                <button type="button" onClick={onDelete}
                  disabled={isPending || deleteConfirmText !== contract.name}
                  className="text-xs px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded font-semibold disabled:opacity-50">
                  {isPending ? 'Deleting…' : 'Delete contract permanently'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
