import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';

export type VendorStatus = 'draft' | 'kyc' | 'approved' | 'suspended';
export type VendorCurrency = 'EGP' | 'USD' | 'AED';

export type VendorRow = {
  id: string;
  code: string;
  legal_name: string;
  trade_name: string | null;
  status: VendorStatus;
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
  rating: number | null;
  notes: string | null;
  approved_by_user: string | null;
  approved_at: string | null;
  created_by_user: string | null;
  created_at: string;
  updated_at: string;
};

export type VendorListRow = VendorRow & {
  item_count: number;
  last_grn_at: string | null;
  total_purchased_egp: number;
};

export const VENDOR_STATUS_LABEL: Record<VendorStatus, { en: string; tone: string }> = {
  draft: { en: 'Draft', tone: 'bg-slate-100 text-slate-700' },
  kyc: { en: 'KYC review', tone: 'bg-amber-50 text-amber-700' },
  approved: { en: 'Approved', tone: 'bg-emerald-50 text-emerald-700' },
  suspended: { en: 'Suspended', tone: 'bg-rose-50 text-rose-700' },
};

export type VendorFilters = {
  search?: string;
  status?: VendorStatus | 'all';
  category?: string;
};

export async function listVendors(filters: VendorFilters = {}): Promise<VendorListRow[]> {
  const sb = supabaseAdmin();
  let q = sb
    .from('beithady_inventory_vendors')
    .select('*')
    .order('legal_name', { ascending: true })
    .limit(500);

  if (filters.status && filters.status !== 'all') q = q.eq('status', filters.status);
  if (filters.search) {
    const s = filters.search.replace(/[,%]/g, '');
    q = q.or(`legal_name.ilike.%${s}%,trade_name.ilike.%${s}%,code.ilike.%${s}%,contact_name.ilike.%${s}%,contact_phone.ilike.%${s}%`);
  }
  if (filters.category) {
    q = q.contains('primary_categories', [filters.category]);
  }

  const { data: vendors } = await q;
  const vendorRows = (vendors as VendorRow[] | null) || [];
  if (vendorRows.length === 0) return [];

  const vendorIds = vendorRows.map(v => v.id);

  // Item count per vendor
  const { data: items } = await sb
    .from('beithady_inventory_items')
    .select('primary_vendor_id')
    .in('primary_vendor_id', vendorIds)
    .eq('active', true);
  const itemCountByVendor = new Map<string, number>();
  for (const i of (items as Array<{ primary_vendor_id: string }> | null) || []) {
    itemCountByVendor.set(i.primary_vendor_id, (itemCountByVendor.get(i.primary_vendor_id) || 0) + 1);
  }

  // Last GRN + total purchased per vendor
  const { data: grns } = await sb
    .from('beithady_inventory_grns')
    .select('vendor_id, posted_at, sub_total_egp')
    .eq('status', 'posted')
    .in('vendor_id', vendorIds)
    .order('posted_at', { ascending: false });
  const grnAggByVendor = new Map<string, { last: string | null; total: number }>();
  for (const g of (grns as Array<{ vendor_id: string; posted_at: string | null; sub_total_egp: number }> | null) || []) {
    const e = grnAggByVendor.get(g.vendor_id) || { last: null, total: 0 };
    if (!e.last && g.posted_at) e.last = g.posted_at;
    e.total += Number(g.sub_total_egp || 0);
    grnAggByVendor.set(g.vendor_id, e);
  }

  return vendorRows.map(v => ({
    ...v,
    item_count: itemCountByVendor.get(v.id) || 0,
    last_grn_at: grnAggByVendor.get(v.id)?.last || null,
    total_purchased_egp: grnAggByVendor.get(v.id)?.total || 0,
  }));
}

export async function getVendor(id: string): Promise<VendorRow | null> {
  const sb = supabaseAdmin();
  const { data } = await sb.from('beithady_inventory_vendors').select('*').eq('id', id).maybeSingle();
  return data as VendorRow | null;
}

// Vendor price-history graph data — every GRN line writes a price-tick.
// Returns last 24 months of unit_cost_egp data points per item from this vendor.
export async function getVendorPriceHistory(
  vendorId: string,
  itemId?: string,
): Promise<Array<{ posted_at: string; item_id: string; sku: string; name_en: string; unit_cost_egp: number; qty_received: number }>> {
  const sb = supabaseAdmin();
  let q = sb
    .from('beithady_inventory_grn_lines')
    .select(`
      unit_cost_egp,
      qty_received,
      item:beithady_inventory_items!inner(id, sku, name_en),
      grn:beithady_inventory_grns!inner(vendor_id, posted_at, status)
    `)
    .eq('grn.status', 'posted')
    .eq('grn.vendor_id', vendorId)
    .order('posted_at', { ascending: true, foreignTable: 'grn' })
    .limit(500);
  if (itemId) q = q.eq('item.id', itemId);

  const { data } = await q;
  return ((data as Array<{
    unit_cost_egp: number;
    qty_received: number;
    item: { id: string; sku: string; name_en: string };
    grn: { posted_at: string };
  }> | null) || []).map(r => ({
    posted_at: r.grn.posted_at,
    item_id: r.item.id,
    sku: r.item.sku,
    name_en: r.item.name_en,
    unit_cost_egp: Number(r.unit_cost_egp),
    qty_received: Number(r.qty_received),
  }));
}
