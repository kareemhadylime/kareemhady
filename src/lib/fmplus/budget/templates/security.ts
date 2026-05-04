// @ts-nocheck — v1 orphan; replaced in Tasks 13-39 of fmplus-budget-v2 plan
import type { TemplateSchemaJsonT, AccountMapJsonT } from '../schema';

export const SECURITY_V1_SCHEMA: TemplateSchemaJsonT = {
  sub_locations_enabled: false,
  default_sub_locations: [],
  season_months: { high: [9,10,11,12,1,2,3,4], low: [5,6,7,8] },
  vat_pct: 14,
  categories: [],
};

export const SECURITY_V1_ACCOUNT_MAP: AccountMapJsonT = [];
