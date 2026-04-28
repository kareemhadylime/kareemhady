'use client';

import { useState, useTransition } from 'react';
import { MoreHorizontal, ChevronDown } from 'lucide-react';
import type { VendorListRow } from '@/lib/beithady/inventory/vendors';
import type { Category } from '@/lib/beithady/inventory/catalog';
import {
  submitForKycAction,
  approveVendorAction,
  suspendVendorAction,
  reactivateVendorAction,
} from '../actions';
import { VendorFormButton } from './vendor-form-button';

export function VendorActionsDropdown({
  vendor, categories, canApprove,
}: {
  vendor: VendorListRow;
  categories: Category[];
  canApprove: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const status = vendor.status;
  const transitions = {
    submitKyc: status === 'draft',
    approve: (status === 'kyc' || status === 'draft') && canApprove,
    suspend: status === 'approved',
    reactivate: status === 'suspended',
  };

  async function run(action: 'submit_kyc' | 'approve' | 'suspend' | 'reactivate') {
    setError(null);
    if (action === 'suspend') {
      const reason = window.prompt('Suspension reason (will be stored in audit log + notes):');
      if (!reason || reason.length < 5) return;
      startTransition(async () => {
        const res = await suspendVendorAction(vendor.id, reason);
        if (!res.ok) setError(res.error);
        else setOpen(false);
      });
    } else if (action === 'approve') {
      const note = window.prompt('Optional approval note:') || undefined;
      startTransition(async () => {
        const res = await approveVendorAction(vendor.id, note);
        if (!res.ok) setError(res.error);
        else setOpen(false);
      });
    } else if (action === 'submit_kyc') {
      startTransition(async () => {
        const res = await submitForKycAction(vendor.id);
        if (!res.ok) setError(res.error);
        else setOpen(false);
      });
    } else {
      startTransition(async () => {
        const res = await reactivateVendorAction(vendor.id);
        if (!res.ok) setError(res.error);
        else setOpen(false);
      });
    }
  }

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-1 text-[11px] text-slate-600 hover:text-slate-900 px-2 py-1 rounded hover:bg-slate-100"
        disabled={pending}
      >
        <MoreHorizontal size={14} /> <ChevronDown size={10} />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-white rounded shadow-lg border border-slate-200 text-[11px] py-1">
            <VendorFormButton
              mode="edit"
              existing={vendor}
              categories={categories}
              triggerLabel="Edit details"
              triggerClass="block w-full text-left px-3 py-1.5 hover:bg-slate-50"
            />
            {transitions.submitKyc && (
              <button type="button" onClick={() => run('submit_kyc')} className="block w-full text-left px-3 py-1.5 hover:bg-amber-50 text-amber-700">
                Submit for KYC
              </button>
            )}
            {transitions.approve && (
              <button type="button" onClick={() => run('approve')} className="block w-full text-left px-3 py-1.5 hover:bg-emerald-50 text-emerald-700 font-medium">
                Approve vendor
              </button>
            )}
            {transitions.suspend && (
              <button type="button" onClick={() => run('suspend')} className="block w-full text-left px-3 py-1.5 hover:bg-rose-50 text-rose-700">
                Suspend
              </button>
            )}
            {transitions.reactivate && (
              <button type="button" onClick={() => run('reactivate')} className="block w-full text-left px-3 py-1.5 hover:bg-emerald-50 text-emerald-700">
                Reactivate
              </button>
            )}
            {!canApprove && (status === 'draft' || status === 'kyc') && (
              <div className="px-3 py-1.5 text-[10px] text-slate-400 italic border-t border-slate-100">
                Approval needs manager+ role
              </div>
            )}
          </div>
        </>
      )}
      {error && (
        <div className="absolute right-0 top-full mt-8 z-50 w-72 bg-rose-50 border border-rose-200 text-rose-700 p-2 rounded text-[11px]">
          {error}
        </div>
      )}
    </div>
  );
}
