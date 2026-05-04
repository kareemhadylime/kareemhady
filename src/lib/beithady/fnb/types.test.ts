import { describe, it, expect } from 'vitest';
import {
  CategorySchema, ItemSchema, ModifierSchema,
  BuildingOverrideSchema, OrderStatusEnum,
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
