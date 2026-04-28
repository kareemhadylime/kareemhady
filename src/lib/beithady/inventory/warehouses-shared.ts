// Shared types + label constants for the inventory warehouses module.
// Lives in its own file (no `server-only` import) so client components
// can pull constants and types without dragging in the supabase admin
// client. Server-side queries live in ./warehouses.ts.

export type WarehouseRow = {
  id: string;
  code: string;
  name_en: string;
  name_ar: string;
  building_code: string | null;
  parent_id: string | null;
  category_tag: 'linen' | 'fnb' | 'maintenance' | 'chemicals' | 'general' | 'welcome_tray' | null;
  manager_user_id: string | null;
  address_line: string | null;
  geo_lat: number | null;
  geo_lng: number | null;
  pin_code: string | null;
  active: boolean;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type WarehouseTreeNode = WarehouseRow & {
  children: WarehouseTreeNode[];
  item_count?: number;
  stock_value_egp?: number;
};

export const BEITHADY_BUILDING_CODES = ['BH-26', 'BH-73', 'BH-435', 'BH-OK', 'BH-34', 'OTHER'] as const;
export type BeithadyBuildingCode = (typeof BEITHADY_BUILDING_CODES)[number];

export const CATEGORY_TAG_LABEL: Record<NonNullable<WarehouseRow['category_tag']>, { en: string; ar: string }> = {
  general: { en: 'General', ar: 'عام' },
  linen: { en: 'Linen', ar: 'مفروشات' },
  fnb: { en: 'F&B', ar: 'مأكولات ومشروبات' },
  chemicals: { en: 'Chemicals', ar: 'مواد كيميائية' },
  maintenance: { en: 'Maintenance', ar: 'صيانة' },
  welcome_tray: { en: 'Welcome Tray', ar: 'صينية الترحيب' },
};
