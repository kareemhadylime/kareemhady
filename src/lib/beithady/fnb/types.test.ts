import { describe, it, expect } from 'vitest';
import {
  CategorySchema, ItemSchema, ModifierSchema,
  BuildingOverrideSchema, OrderStatusEnum,
  SubmitOrderPayloadSchema,
} from './types';

describe('fnb Zod schemas', () => {
  it('CategorySchema accepts valid input', () => {
    expect(CategorySchema.parse({
      slug: 'breakfast', name_en: 'Breakfast',
      sort_order: 1, hours_start: '08:00', hours_end: '14:00', enabled: true,
    })).toBeDefined();
  });
  it('CategorySchema rejects empty name_en', () => {
    expect(() => CategorySchema.parse({ slug: 'x', name_en: '' })).toThrow();
  });
  it('ItemSchema rejects negative price', () => {
    expect(() => ItemSchema.parse({
      slug: 'x', category_id: '00000000-0000-0000-0000-000000000000',
      name_en: 'X', price_usd: -1,
    })).toThrow();
  });
  it('ModifierSchema rejects negative delta', () => {
    expect(() => ModifierSchema.parse({
      item_id: '00000000-0000-0000-0000-000000000000',
      name_en: 'X', price_delta_usd: -0.5,
    })).toThrow();
  });
  it('BuildingOverrideSchema requires building_code + item_id', () => {
    expect(BuildingOverrideSchema.parse({
      building_code: 'BH-26',
      item_id: '00000000-0000-0000-0000-000000000000',
      is_out_of_stock: true,
    })).toBeDefined();
  });
  it('OrderStatusEnum has all 6 values', () => {
    expect(OrderStatusEnum.options).toEqual([
      'submitted','preparing','ready','delivered','closed','cancelled',
    ]);
  });
});

describe('datetime parsing', () => {
  it('accepts PostgREST-format offset timestamps in BuildingOverrideSchema', () => {
    expect(BuildingOverrideSchema.parse({
      building_code: 'BH-26',
      item_id: '00000000-0000-0000-0000-000000000000',
      is_out_of_stock: true,
      out_of_stock_until: '2026-05-04T18:00:00.000+00:00',
    })).toBeDefined();
  });
  it('accepts PostgREST-format offset timestamps in SubmitOrderPayloadSchema', () => {
    expect(SubmitOrderPayloadSchema.parse({
      idempotency_key: '00000000-0000-0000-0000-000000000000',
      requested_delivery_at: '2026-05-04T18:00:00+03:00',
      lines: [{ item_id: '00000000-0000-0000-0000-000000000000', quantity: 1 }],
    })).toBeDefined();
  });
});

describe('HHMM regex', () => {
  it('rejects invalid hour 25:00', () => {
    expect(() => CategorySchema.parse({
      slug: 'x', name_en: 'X', hours_start: '25:00', hours_end: '23:59',
    })).toThrow();
  });
  it('rejects invalid minute 12:99', () => {
    expect(() => CategorySchema.parse({
      slug: 'x', name_en: 'X', hours_start: '12:99', hours_end: '23:59',
    })).toThrow();
  });
  it('accepts valid 23:59', () => {
    expect(CategorySchema.parse({
      slug: 'x', name_en: 'X', hours_start: '08:00', hours_end: '23:59',
    })).toBeDefined();
  });
});
