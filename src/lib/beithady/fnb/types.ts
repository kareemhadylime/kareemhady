import { z } from 'zod';

export const LangCodeEnum = z.enum(['en', 'ar', 'ru', 'fr']);
export type LangCode = z.infer<typeof LangCodeEnum>;

export const OrderStatusEnum = z.enum([
  'submitted', 'preparing', 'ready', 'delivered', 'closed', 'cancelled',
]);
export type OrderStatus = z.infer<typeof OrderStatusEnum>;

export const ChangedViaEnum = z.enum(['dashboard', 'cron', 'guest', 'webhook']);

const HHMM = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'must be HH:MM');

export const CategorySchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1).max(64),
  sort_order: z.number().int().nonnegative().default(0),
  name_en: z.string().min(1),
  name_ar: z.string().nullable().optional(),
  name_ru: z.string().nullable().optional(),
  name_fr: z.string().nullable().optional(),
  hours_start: HHMM.default('08:00'),
  hours_end: HHMM.default('23:59'),
  enabled: z.boolean().default(true),
  ai_translation_flags: z.record(z.string(), z.boolean()).default({}),
  created_at: z.string().datetime({ offset: true }).optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
});
export type Category = z.infer<typeof CategorySchema>;

export const ItemSchema = z.object({
  id: z.string().uuid().optional(),
  slug: z.string().min(1).max(96),
  category_id: z.string().uuid(),
  sort_order: z.number().int().nonnegative().default(0),
  name_en: z.string().min(1),
  name_ar: z.string().nullable().optional(),
  name_ru: z.string().nullable().optional(),
  name_fr: z.string().nullable().optional(),
  description_en: z.string().nullable().optional(),
  description_ar: z.string().nullable().optional(),
  description_ru: z.string().nullable().optional(),
  description_fr: z.string().nullable().optional(),
  photo_path: z.string().nullable().optional(),
  photo_thumb_path: z.string().nullable().optional(),
  price_usd: z.number().nonnegative().multipleOf(0.01),
  cost_usd: z.number().nonnegative().multipleOf(0.01).nullable().optional(),
  hours_start_override: HHMM.nullable().optional(),
  hours_end_override: HHMM.nullable().optional(),
  recipe_id: z.string().uuid().nullable().optional(),
  enabled: z.boolean().default(true),
  ai_translation_flags: z.record(z.string(), z.boolean()).default({}),
  created_at: z.string().datetime({ offset: true }).optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
  deleted_at: z.string().datetime({ offset: true }).nullable().optional(),
});
export type Item = z.infer<typeof ItemSchema>;

export const ModifierSchema = z.object({
  id: z.string().uuid().optional(),
  item_id: z.string().uuid(),
  sort_order: z.number().int().nonnegative().default(0),
  name_en: z.string().min(1),
  name_ar: z.string().nullable().optional(),
  name_ru: z.string().nullable().optional(),
  name_fr: z.string().nullable().optional(),
  price_delta_usd: z.number().nonnegative().multipleOf(0.01),
  enabled: z.boolean().default(true),
  ai_translation_flags: z.record(z.string(), z.boolean()).default({}),
  created_at: z.string().datetime({ offset: true }).optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
});
export type Modifier = z.infer<typeof ModifierSchema>;

export const BuildingOverrideSchema = z.object({
  id: z.string().uuid().optional(),
  building_code: z.string().regex(/^BH-[A-Z0-9]+$/),
  item_id: z.string().uuid(),
  is_out_of_stock: z.boolean().default(false),
  out_of_stock_until: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.string().datetime({ offset: true }).optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
});
export type BuildingOverride = z.infer<typeof BuildingOverrideSchema>;

export const RecipeLineSchema = z.object({
  id: z.string().uuid().optional(),
  item_id: z.string().uuid(),
  inventory_item_id: z.string().uuid(),
  quantity: z.number().positive().multipleOf(0.001),
  notes: z.string().nullable().optional(),
  created_at: z.string().datetime({ offset: true }).optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
});
export type RecipeLine = z.infer<typeof RecipeLineSchema>;

export const BuildingSchema = z.object({
  building_code: z.string().regex(/^BH-[A-Z0-9]+$/),
  enabled: z.boolean().default(false),
  kitchen_wa_recipients: z.array(z.string().regex(/^\+?\d{8,15}$/)).default([]),
  delivery_sla_minutes: z.number().int().positive().default(30),
  receipt_vat_line: z.string().nullable().optional(),
  message_template_overrides: z.record(z.string(), z.string()).default({}),
  cancellation_grace_seconds: z.number().int().min(30).max(300).default(120),
  created_at: z.string().datetime({ offset: true }).optional(),
  updated_at: z.string().datetime({ offset: true }).optional(),
});
export type Building = z.infer<typeof BuildingSchema>;

export const OrderItemSnapshotSchema = z.object({
  item_id: z.string().uuid().nullable(),
  item_name_snapshot: z.string(),
  quantity: z.number().int().positive().max(10),
  unit_price_usd_snapshot: z.number().nonnegative(),
  modifier_snapshot: z.array(z.object({
    id: z.string().uuid(),
    name_en: z.string(),
    name_localized: z.string(),
    price_delta_usd: z.number().nonnegative(),
  })).default([]),
  line_total_usd: z.number().nonnegative(),
  notes: z.string().max(200).nullable().optional(),
  created_at: z.string().datetime({ offset: true }).optional(),
});
export type OrderItemSnapshot = z.infer<typeof OrderItemSnapshotSchema>;

export const SubmitOrderPayloadSchema = z.object({
  idempotency_key: z.string().uuid(),
  guest_language: LangCodeEnum.default('en'),
  requested_delivery_at: z.string().datetime({ offset: true }).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  lines: z.array(z.object({
    item_id: z.string().uuid(),
    quantity: z.number().int().positive().max(10),
    modifier_ids: z.array(z.string().uuid()).default([]),
    notes: z.string().max(200).nullable().optional(),
  })).min(1).max(20),
});
export type SubmitOrderPayload = z.infer<typeof SubmitOrderPayloadSchema>;

export const StatusUpdatePayloadSchema = z.object({
  to_status: OrderStatusEnum,
  notes: z.string().max(500).nullable().optional(),
});
export type StatusUpdatePayload = z.infer<typeof StatusUpdatePayloadSchema>;

export const BulkPriceUpdatePayloadSchema = z.object({
  category_id: z.string().uuid().nullable().optional(),
  item_ids: z.array(z.string().uuid()).default([]),
  delta_pct: z.number().min(-50).max(100),
  round_to_cents: z.literal(true).default(true),
});
export type BulkPriceUpdatePayload = z.infer<typeof BulkPriceUpdatePayloadSchema>;

export type ChangedVia = z.infer<typeof ChangedViaEnum>;
