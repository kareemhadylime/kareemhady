'use server';

import { revalidatePath } from 'next/cache';
import { supabaseAdmin } from '@/lib/supabase';
import { requireBeithadyPermission } from '@/lib/beithady/auth';
import { recordAudit } from '@/lib/beithady/audit';
import type { VendorRow, VendorStatus, VendorCurrency } from '@/lib/beithady/inventory/vendors';

export type VendorFormInput = {
  code: string;
  legal_name: string;
  trade_name: string | null;
  tax_id: string | null;
  commercial_reg_no: string | null;
  vat_no: string | null;
  payment_terms_days: number;
  default_currency: VendorCurrency;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  whatsapp_e164: string | null;
  address_line: string | null;
  city: string | null;
  country: string;
  bank_name: string | null;
  bank_iban: string | null;
  bank_account: string | null;
  amazon_eg_storefront_url: string | null;
  primary_categories: string[];
  notes: string | null;
};

export type VendorActionResult =
  | { ok: true; vendor: VendorRow }
  | { ok: false; error: string };

function validate(input: VendorFormInput): string | null {
  if (!input.code || input.code.length < 3) return 'Code must be ≥ 3 characters';
  if (!/^[A-Z0-9-_]+$/.test(input.code)) return 'Code must be uppercase letters/digits/hyphen/underscore only';
  if (!input.legal_name) return 'Legal name is required';
  if (input.payment_terms_days < 0) return 'Payment terms cannot be negative';
  if (input.contact_email && !/.+@.+\..+/.test(input.contact_email)) return 'Invalid email';
  if (input.whatsapp_e164 && !/^\+?[1-9]\d{6,14}$/.test(input.whatsapp_e164.replace(/\s/g, ''))) {
    return 'WhatsApp must be E.164 format (e.g. +20122...)';
  }
  return null;
}

export async function createVendorAction(input: VendorFormInput): Promise<VendorActionResult> {
  const { user, roles } = await requireBeithadyPermission('inventory', 'full');
  const err = validate(input);
  if (err) return { ok: false, error: err };

  const sb = supabaseAdmin();
  // Admins get auto-approved (per Risk register #9)
  const isAdmin = roles.includes('admin');
  const status: VendorStatus = isAdmin ? 'approved' : 'draft';

  const { data, error } = await sb
    .from('beithady_inventory_vendors')
    .insert({
      code: input.code.trim().toUpperCase(),
      legal_name: input.legal_name.trim(),
      trade_name: input.trade_name,
      status,
      tax_id: input.tax_id,
      commercial_reg_no: input.commercial_reg_no,
      vat_no: input.vat_no,
      payment_terms_days: input.payment_terms_days,
      default_currency: input.default_currency,
      contact_name: input.contact_name,
      contact_phone: input.contact_phone,
      contact_email: input.contact_email,
      whatsapp_e164: input.whatsapp_e164,
      address_line: input.address_line,
      city: input.city,
      country: input.country || 'Egypt',
      bank_name: input.bank_name,
      bank_iban: input.bank_iban,
      bank_account: input.bank_account,
      amazon_eg_storefront_url: input.amazon_eg_storefront_url,
      primary_categories: input.primary_categories,
      notes: input.notes,
      approved_by_user: status === 'approved' ? user.id : null,
      approved_at: status === 'approved' ? new Date().toISOString() : null,
      created_by_user: user.id,
    })
    .select('*')
    .single();

  if (error || !data) {
    return { ok: false, error: error?.message?.includes('duplicate') ? `Code "${input.code}" already exists` : (error?.message || 'Insert failed') };
  }

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'vendor.create',
    target_type: 'vendor',
    target_id: data.id,
    after: data,
    metadata: { auto_approved: status === 'approved' },
  });

  revalidatePath('/beithady/inventory/vendors');
  revalidatePath('/beithady/inventory');
  return { ok: true, vendor: data as VendorRow };
}

export async function updateVendorAction(
  id: string,
  patch: Partial<VendorFormInput>,
): Promise<VendorActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();
  const { data: before } = await sb.from('beithady_inventory_vendors').select('*').eq('id', id).maybeSingle();
  if (!before) return { ok: false, error: 'Vendor not found' };

  const update: Record<string, unknown> = {};
  for (const k of Object.keys(patch) as Array<keyof VendorFormInput>) update[k] = patch[k];
  update.updated_at = new Date().toISOString();

  const { data, error } = await sb
    .from('beithady_inventory_vendors')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error || !data) return { ok: false, error: error?.message || 'Update failed' };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'vendor.update',
    target_type: 'vendor',
    target_id: id,
    before,
    after: data,
  });
  revalidatePath('/beithady/inventory/vendors');
  return { ok: true, vendor: data as VendorRow };
}

// KYC workflow transitions
export async function submitForKycAction(id: string): Promise<VendorActionResult> {
  return transitionVendorStatusAction(id, 'kyc', 'vendor.submit_kyc');
}

export async function approveVendorAction(id: string, note?: string): Promise<VendorActionResult> {
  const { user, roles } = await requireBeithadyPermission('inventory', 'full');
  // Approval requires manager+ role (admin, manager, or warehouse_manager)
  if (!roles.some(r => ['admin', 'manager', 'warehouse_manager'].includes(r))) {
    return { ok: false, error: 'Approval requires manager or warehouse_manager role' };
  }
  const sb = supabaseAdmin();
  const { data: before } = await sb.from('beithady_inventory_vendors').select('*').eq('id', id).maybeSingle();
  if (!before) return { ok: false, error: 'Vendor not found' };

  const { data, error } = await sb
    .from('beithady_inventory_vendors')
    .update({
      status: 'approved',
      approved_by_user: user.id,
      approved_at: new Date().toISOString(),
      notes: note ? `${before.notes || ''}\n\n[Approved ${new Date().toISOString().slice(0, 10)}] ${note}` : before.notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error || !data) return { ok: false, error: error?.message || 'Approval failed' };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action: 'vendor.approve',
    target_type: 'vendor',
    target_id: id,
    before,
    after: data,
    metadata: note ? { approval_note: note } : undefined,
  });
  revalidatePath('/beithady/inventory/vendors');
  return { ok: true, vendor: data as VendorRow };
}

export async function suspendVendorAction(id: string, reason: string): Promise<VendorActionResult> {
  if (!reason || reason.length < 5) return { ok: false, error: 'Suspension reason is required (min 5 chars)' };
  return transitionVendorStatusAction(id, 'suspended', 'vendor.suspend', reason);
}

export async function reactivateVendorAction(id: string): Promise<VendorActionResult> {
  return transitionVendorStatusAction(id, 'approved', 'vendor.reactivate');
}

async function transitionVendorStatusAction(
  id: string,
  newStatus: VendorStatus,
  action: string,
  reason?: string,
): Promise<VendorActionResult> {
  const { user } = await requireBeithadyPermission('inventory', 'full');
  const sb = supabaseAdmin();
  const { data: before } = await sb.from('beithady_inventory_vendors').select('*').eq('id', id).maybeSingle();
  if (!before) return { ok: false, error: 'Vendor not found' };

  const update: Record<string, unknown> = {
    status: newStatus,
    updated_at: new Date().toISOString(),
  };
  if (reason) {
    update.notes = `${before.notes || ''}\n\n[${action} ${new Date().toISOString().slice(0, 10)}] ${reason}`;
  }

  const { data, error } = await sb
    .from('beithady_inventory_vendors')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error || !data) return { ok: false, error: error?.message || 'Status change failed' };

  await recordAudit({
    actor_user_id: user.id,
    module: 'inventory',
    action,
    target_type: 'vendor',
    target_id: id,
    before,
    after: data,
    metadata: reason ? { reason } : undefined,
  });
  revalidatePath('/beithady/inventory/vendors');
  return { ok: true, vendor: data as VendorRow };
}
