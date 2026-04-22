import { supabaseAdmin } from './supabase';

// Raw-materials catalog for Kika / X-Label manufacturing. Categories + units
// taken from the standard apparel-manufacturing BOM vocabulary so future
// bill-of-materials joins (product_bom linking shopify_products.id to
// raw_materials.id with qty) can aggregate cleanly across variants.

export type RawMaterialCategory =
  | 'fabric'
  | 'trim'
  | 'zipper'
  | 'button'
  | 'thread'
  | 'elastic'
  | 'label'
  | 'packaging'
  | 'padding'
  | 'decorative'
  | 'misc';

export const RAW_MATERIAL_CATEGORIES: Array<{
  id: RawMaterialCategory;
  label: string;
  description: string;
  default_unit: string;
  icon_hint: string; // lucide icon name
  example_subcategories: string[];
}> = [
  {
    id: 'fabric',
    label: 'Fabric / Cloth',
    description:
      'Main body cloth, knit, woven, mesh, lace, lining, interlining.',
    default_unit: 'm',
    icon_hint: 'Shirt',
    example_subcategories: ['knit', 'woven', 'mesh', 'lace', 'lining', 'interlining'],
  },
  {
    id: 'trim',
    label: 'Trims & Closures',
    description:
      'Snaps, hooks & eyes, velcro, buckles, D-rings, sliders, drawstrings.',
    default_unit: 'pc',
    icon_hint: 'Link',
    example_subcategories: ['snap', 'hook_and_eye', 'velcro', 'buckle', 'slider', 'drawstring'],
  },
  {
    id: 'zipper',
    label: 'Zippers',
    description: 'Closed-end, open-end, invisible, metal, plastic, brass.',
    default_unit: 'pc',
    icon_hint: 'GitMerge',
    example_subcategories: ['closed_end', 'open_end', 'invisible', 'metal', 'plastic'],
  },
  {
    id: 'button',
    label: 'Buttons',
    description: 'Shell, plastic, wood, metal, decorative, pearl.',
    default_unit: 'pc',
    icon_hint: 'Circle',
    example_subcategories: ['plastic', 'metal', 'wood', 'shell', 'pearl', 'fabric_covered'],
  },
  {
    id: 'thread',
    label: 'Thread',
    description: 'Sewing, overlock, embroidery. Tracked per spool/reel.',
    default_unit: 'reel',
    icon_hint: 'Spool',
    example_subcategories: ['sewing', 'overlock', 'embroidery', 'serger'],
  },
  {
    id: 'elastic',
    label: 'Elastic',
    description:
      'Waistband, cuff, shirring, swimwear band. Tracked in meters.',
    default_unit: 'm',
    icon_hint: 'Slash',
    example_subcategories: ['waistband', 'cuff', 'shirring', 'band'],
  },
  {
    id: 'label',
    label: 'Labels & Tags',
    description:
      'Woven brand labels, care labels, size labels, hang tags, price tags.',
    default_unit: 'pc',
    icon_hint: 'Tag',
    example_subcategories: ['brand', 'care', 'size', 'hang_tag', 'price_tag'],
  },
  {
    id: 'packaging',
    label: 'Packaging',
    description:
      'Poly bags, boxes, tissue paper, shopping bags, stickers, tape.',
    default_unit: 'pc',
    icon_hint: 'Package',
    example_subcategories: ['poly_bag', 'box', 'tissue', 'shopping_bag', 'sticker', 'tape'],
  },
  {
    id: 'padding',
    label: 'Padding & Inserts',
    description: 'Bra pads (swimwear), shoulder pads, hip pads.',
    default_unit: 'pc',
    icon_hint: 'Layers',
    example_subcategories: ['bra_pad', 'shoulder_pad', 'hip_pad'],
  },
  {
    id: 'decorative',
    label: 'Decorative',
    description:
      'Beads, sequins, lace trim, piping, ribbons, embroidery appliqués.',
    default_unit: 'pc',
    icon_hint: 'Sparkles',
    example_subcategories: ['beads', 'sequins', 'lace_trim', 'piping', 'ribbon', 'applique'],
  },
  {
    id: 'misc',
    label: 'Other / Misc',
    description: 'Rivets, studs, eyelets, grommets, safety pins, stay tape.',
    default_unit: 'pc',
    icon_hint: 'Puzzle',
    example_subcategories: ['rivet', 'stud', 'eyelet', 'grommet', 'safety_pin', 'stay_tape'],
  },
];

export const RAW_MATERIAL_UNITS: Array<{ id: string; label: string }> = [
  { id: 'm', label: 'meter (m)' },
  { id: 'yd', label: 'yard (yd)' },
  { id: 'cm', label: 'centimeter (cm)' },
  { id: 'kg', label: 'kilogram (kg)' },
  { id: 'g', label: 'gram (g)' },
  { id: 'pc', label: 'piece (pc)' },
  { id: 'sheet', label: 'sheet' },
  { id: 'pkg', label: 'package (pkg)' },
  { id: 'box', label: 'box' },
  { id: 'roll', label: 'roll' },
  { id: 'reel', label: 'reel / spool' },
];

export type RawMaterial = {
  id: string;
  domain: string;
  code: string | null;
  name: string;
  category: RawMaterialCategory;
  subcategory: string | null;
  color: string | null;
  unit: string;
  unit_cost: number | null;
  currency: string;
  qty_on_hand: number;
  qty_min: number | null;
  supplier: string | null;
  supplier_sku: string | null;
  image_url: string | null;
  description: string | null;
  tags: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
  low_stock: boolean;
  stock_value: number | null; // qty_on_hand * unit_cost (derived)
};

function mapRow(r: Record<string, unknown>): RawMaterial {
  const qty = Number(r.qty_on_hand) || 0;
  const qtyMin = r.qty_min == null ? null : Number(r.qty_min);
  const unitCost = r.unit_cost == null ? null : Number(r.unit_cost);
  return {
    id: String(r.id),
    domain: String(r.domain),
    code: (r.code as string | null) ?? null,
    name: String(r.name ?? ''),
    category: (r.category as RawMaterialCategory) || 'misc',
    subcategory: (r.subcategory as string | null) ?? null,
    color: (r.color as string | null) ?? null,
    unit: String(r.unit ?? 'pc'),
    unit_cost: unitCost,
    currency: String(r.currency ?? 'EGP'),
    qty_on_hand: qty,
    qty_min: qtyMin,
    supplier: (r.supplier as string | null) ?? null,
    supplier_sku: (r.supplier_sku as string | null) ?? null,
    image_url: (r.image_url as string | null) ?? null,
    description: (r.description as string | null) ?? null,
    tags: Array.isArray(r.tags) ? (r.tags as string[]) : [],
    active: r.active !== false,
    created_at: String(r.created_at ?? ''),
    updated_at: String(r.updated_at ?? ''),
    low_stock: qtyMin != null && qty < qtyMin,
    stock_value: unitCost != null ? qty * unitCost : null,
  };
}

export async function listRawMaterials(
  opts: {
    domain?: string;
    search?: string;
    category?: RawMaterialCategory | 'all';
    lowStockOnly?: boolean;
    activeOnly?: boolean;
    limit?: number;
  } = {}
): Promise<RawMaterial[]> {
  const sb = supabaseAdmin();
  let q = sb
    .from('raw_materials')
    .select('*')
    .eq('domain', opts.domain ?? 'kika')
    .order('category')
    .order('name')
    .limit(opts.limit ?? 500);
  if (opts.activeOnly !== false) q = q.eq('active', true);
  if (opts.category && opts.category !== 'all') q = q.eq('category', opts.category);
  if (opts.search && opts.search.trim()) {
    const s = opts.search.trim().replace(/[,()]/g, ' ');
    q = q.or(
      `name.ilike.%${s}%,code.ilike.%${s}%,supplier.ilike.%${s}%,subcategory.ilike.%${s}%,color.ilike.%${s}%`
    );
  }
  const { data, error } = await q;
  if (error) throw new Error(`listRawMaterials: ${error.message}`);
  let rows = ((data as Array<Record<string, unknown>>) || []).map(mapRow);
  if (opts.lowStockOnly) rows = rows.filter(r => r.low_stock);
  return rows;
}

export async function fetchRawMaterial(id: string): Promise<RawMaterial | null> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('raw_materials')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!data) return null;
  return mapRow(data as Record<string, unknown>);
}

export type RawMaterialSummary = {
  total_count: number;
  active_count: number;
  low_stock_count: number;
  total_stock_value: number;
  by_category: Array<{ category: RawMaterialCategory; count: number; value: number }>;
};

export async function summarizeRawMaterials(domain = 'kika'): Promise<RawMaterialSummary> {
  const rows = await listRawMaterials({ domain, activeOnly: false, limit: 5000 });
  const active = rows.filter(r => r.active);
  const lowStock = active.filter(r => r.low_stock);
  const totalValue = active.reduce((s, r) => s + (r.stock_value || 0), 0);
  const byCatMap = new Map<RawMaterialCategory, { count: number; value: number }>();
  for (const r of active) {
    const b = byCatMap.get(r.category) || { count: 0, value: 0 };
    b.count += 1;
    b.value += r.stock_value || 0;
    byCatMap.set(r.category, b);
  }
  return {
    total_count: rows.length,
    active_count: active.length,
    low_stock_count: lowStock.length,
    total_stock_value: totalValue,
    by_category: Array.from(byCatMap.entries())
      .map(([category, v]) => ({ category, count: v.count, value: v.value }))
      .sort((a, b) => b.value - a.value),
  };
}
