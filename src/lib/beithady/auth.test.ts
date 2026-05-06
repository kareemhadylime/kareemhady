import { describe, it, expect } from 'vitest';
import { rolesGrantPermission, visibleCategoriesFor } from './auth';

describe('fnb category permissions', () => {
  it('guest_relations has full on fnb', () => {
    expect(rolesGrantPermission(['guest_relations'], 'fnb', 'full')).toBe(true);
  });
  it('finance has read on fnb (not full)', () => {
    expect(rolesGrantPermission(['finance'], 'fnb', 'read')).toBe(true);
    expect(rolesGrantPermission(['finance'], 'fnb', 'full')).toBe(false);
  });
  it('housekeeper has none on fnb', () => {
    expect(rolesGrantPermission(['housekeeper'], 'fnb', 'read')).toBe(false);
  });
  it('warehouse_manager has none on fnb', () => {
    expect(rolesGrantPermission(['warehouse_manager'], 'fnb', 'read')).toBe(false);
  });
  it('business_analyst has read on fnb', () => {
    expect(rolesGrantPermission(['business_analyst'], 'fnb', 'read')).toBe(true);
    expect(rolesGrantPermission(['business_analyst'], 'fnb', 'full')).toBe(false);
  });
  it('fnb_manager has full on fnb', () => {
    expect(rolesGrantPermission(['fnb_manager'], 'fnb', 'full')).toBe(true);
  });
  it('fnb_manager has read on operations + crm, none on financial', () => {
    expect(rolesGrantPermission(['fnb_manager'], 'operations', 'read')).toBe(true);
    expect(rolesGrantPermission(['fnb_manager'], 'crm', 'read')).toBe(true);
    expect(rolesGrantPermission(['fnb_manager'], 'financial', 'read')).toBe(false);
  });
  it('visibleCategoriesFor includes fnb for ops', () => {
    expect(visibleCategoriesFor(['ops'])).toContain('fnb');
  });
  it('visibleCategoriesFor excludes fnb for housekeeper', () => {
    expect(visibleCategoriesFor(['housekeeper'])).not.toContain('fnb');
  });
});
