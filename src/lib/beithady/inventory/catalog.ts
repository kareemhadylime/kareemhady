import 'server-only';
import { supabaseAdmin } from '@/lib/supabase';
export type AiInfoStatus = 'idle' | 'queued' | 'running' | 'error';

export type AiItemInfoPayload = {
  summary_en: string;
  summary_ar: string;
  key_features: string[];
  usage_tips: string;
  ingredients_or_materials: string | null;
  warnings: string | null;
  pack_details: string;
  source: 'amazon_eg_fetch' | 'general_knowledge';
  source_url: string | null;
  model: string;
  generated_at: string;
};

export type Category = {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  parent_id: string | null;
  is_consumable: boolean;
  is_asset: boolean;
  default_uom: string;
  default_batch_tracked: boolean;
  default_expiry_tracked: boolean;
  sort_order: number;
  active: boolean;
};

export type Uom = {
  code: string;
  name_en: string;
  name_ar: string;
  measure_kind: 'count' | 'mass' | 'volume' | 'length' | 'area';
  sort_order: number;
};

export type ItemRow = {
  id: string;
  sku: string;
  name_en: string;
  name_ar: string;
  category_id: string;
  uom: string;
  brand: string | null;
  barcode: string | null;
  primary_vendor_id: string | null;
  photo_url: string | null;
  description: string | null;
  min_qty: number;
  max_qty: number | null;
  reorder_qty: number | null;
  default_cost_egp: number;
  default_cost_usd: number | null;
  currency: 'EGP' | 'USD';
  avg_cost_egp: number;
  last_cost_egp: number | null;
  batch_tracked: boolean;
  expiry_tracked: boolean;
  owner_billable: boolean;
  is_asset: boolean;
  serial_tracked: boolean;
  amazon_eg_url: string | null;
  amazon_eg_url_reviewed_at: string | null;
  amazon_eg_url_reviewed_by: string | null;
  amazon_eg_price_egp: number | null;
  amazon_eg_pack_size: number | null;
  amazon_eg_image_url: string | null;
  amazon_eg_last_status: 'ok' | 'oos' | '404' | 'price_changed' | 'unchecked' | 'rate_limited' | null;
  amazon_eg_last_checked_at: string | null;
  amazon_eg_product_name_en: string | null;
  amazon_eg_product_name_ar: string | null;
  amazon_eg_brand: string | null;
  amazon_eg_pack_volume_value: number | null;
  amazon_eg_pack_volume_uom: string | null;
  pack_volume_value: number | null;
  pack_volume_uom: string | null;
  ai_info: AiItemInfoPayload | null;
  ai_info_generated_at: string | null;
  ai_info_source: 'amazon_eg_fetch' | 'general_knowledge' | null;
  ai_info_status: AiInfoStatus;
  ai_info_error: string | null;
  active: boolean;
  created_by_user: string | null;
  created_at: string;
  updated_at: string;
};

export type ItemListRow = ItemRow & {
  category_name_en: string;
  category_name_ar: string;
  category_code: string;
  vendor_name: string | null;
  total_on_hand: number;
  amazon_eg_url_reviewed_by_name: string | null;
};

export async function listCategories(): Promise<Category[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_inventory_categories')
    .select('*')
    .eq('active', true)
    .order('sort_order', { ascending: true });
  return (data as Category[] | null) || [];
}

export async function listUoms(): Promise<Uom[]> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_inventory_uoms')
    .select('*')
    .order('sort_order', { ascending: true });
  return (data as Uom[] | null) || [];
}

export type ItemFilters = {
  search?: string;
  categoryCode?: string;
  status?: 'active' | 'inactive' | 'all';
  lowStock?: boolean;
  /**
   * Show only items that have an amazon_eg_url set but no
   * amazon_eg_url_reviewed_at — operator hasn't confirmed the URL yet.
   * Pairs with the "Needs review" chip on the items page.
   */
  needsReview?: boolean;
};

export async function listItems(filters: ItemFilters = {}): Promise<ItemListRow[]> {
  const sb = supabaseAdmin();
  let q = sb
    .from('beithady_inventory_items')
    .select(`
      *,
      category:beithady_inventory_categories!inner(code, name_en, name_ar),
      vendor:beithady_inventory_vendors(legal_name, trade_name),
      stock:beithady_inventory_stock(qty_on_hand),
      reviewer:app_users!amazon_eg_url_reviewed_by(username)
    `)
    .order('name_en', { ascending: true })
    .limit(500);

  if (filters.status === 'active' || !filters.status) q = q.eq('active', true);
  else if (filters.status === 'inactive') q = q.eq('active', false);

  if (filters.search) {
    const s = filters.search.replace(/[,%]/g, '');
    q = q.or(`sku.ilike.%${s}%,name_en.ilike.%${s}%,name_ar.ilike.%${s}%,brand.ilike.%${s}%,barcode.ilike.%${s}%`);
  }

  if (filters.categoryCode) {
    const cats = await listCategories();
    const cat = cats.find(c => c.code === filters.categoryCode);
    if (cat) q = q.eq('category_id', cat.id);
  }

  if (filters.needsReview) {
    q = q.not('amazon_eg_url', 'is', null).is('amazon_eg_url_reviewed_at', null);
  }

  const { data } = await q;
  const rows = (data as Array<ItemRow & {
    category: { code: string; name_en: string; name_ar: string };
    vendor: { legal_name: string; trade_name: string | null } | null;
    stock: Array<{ qty_on_hand: number }> | null;
    reviewer: { username: string | null } | null;
  }> | null) || [];

  const mapped: ItemListRow[] = rows.map(r => {
    const totalOnHand = (r.stock || []).reduce((s, x) => s + Number(x.qty_on_hand || 0), 0);
    return {
      id: r.id,
      sku: r.sku,
      name_en: r.name_en,
      name_ar: r.name_ar,
      category_id: r.category_id,
      uom: r.uom,
      brand: r.brand,
      barcode: r.barcode,
      primary_vendor_id: r.primary_vendor_id,
      photo_url: r.photo_url,
      description: r.description,
      min_qty: Number(r.min_qty),
      max_qty: r.max_qty != null ? Number(r.max_qty) : null,
      reorder_qty: r.reorder_qty != null ? Number(r.reorder_qty) : null,
      default_cost_egp: Number(r.default_cost_egp),
      default_cost_usd: r.default_cost_usd != null ? Number(r.default_cost_usd) : null,
      currency: r.currency,
      avg_cost_egp: Number(r.avg_cost_egp),
      last_cost_egp: r.last_cost_egp != null ? Number(r.last_cost_egp) : null,
      batch_tracked: r.batch_tracked,
      expiry_tracked: r.expiry_tracked,
      owner_billable: r.owner_billable,
      is_asset: r.is_asset,
      serial_tracked: r.serial_tracked,
      amazon_eg_url: r.amazon_eg_url,
      amazon_eg_url_reviewed_at: r.amazon_eg_url_reviewed_at,
      amazon_eg_url_reviewed_by: r.amazon_eg_url_reviewed_by,
      amazon_eg_price_egp: r.amazon_eg_price_egp != null ? Number(r.amazon_eg_price_egp) : null,
      amazon_eg_pack_size: r.amazon_eg_pack_size != null ? Number(r.amazon_eg_pack_size) : null,
      amazon_eg_image_url: r.amazon_eg_image_url,
      amazon_eg_last_status: r.amazon_eg_last_status,
      amazon_eg_last_checked_at: r.amazon_eg_last_checked_at,
      amazon_eg_product_name_en: r.amazon_eg_product_name_en,
      amazon_eg_product_name_ar: r.amazon_eg_product_name_ar,
      amazon_eg_brand: r.amazon_eg_brand,
      amazon_eg_pack_volume_value: r.amazon_eg_pack_volume_value != null ? Number(r.amazon_eg_pack_volume_value) : null,
      amazon_eg_pack_volume_uom: r.amazon_eg_pack_volume_uom,
      pack_volume_value: r.pack_volume_value != null ? Number(r.pack_volume_value) : null,
      pack_volume_uom: r.pack_volume_uom,
      ai_info: r.ai_info,
      ai_info_generated_at: r.ai_info_generated_at,
      ai_info_source: r.ai_info_source,
      ai_info_status: (r.ai_info_status || 'idle') as AiInfoStatus,
      ai_info_error: r.ai_info_error,
      active: r.active,
      created_by_user: r.created_by_user,
      created_at: r.created_at,
      updated_at: r.updated_at,
      category_code: r.category.code,
      category_name_en: r.category.name_en,
      category_name_ar: r.category.name_ar,
      vendor_name: r.vendor?.trade_name || r.vendor?.legal_name || null,
      total_on_hand: totalOnHand,
      amazon_eg_url_reviewed_by_name: r.reviewer?.username || null,
    };
  });

  if (filters.lowStock) {
    // Audit fix H6: was `<`. Items exactly at min_qty are at the reorder
    // floor and should appear in the low-stock filter.
    return mapped.filter(it => it.total_on_hand <= it.min_qty);
  }
  return mapped;
}

export async function getItem(id: string): Promise<ItemRow | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('beithady_inventory_items')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return data as ItemRow | null;
}
