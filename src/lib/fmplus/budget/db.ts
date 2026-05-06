import { supabaseAdmin } from '@/lib/supabase';

/**
 * Service-role Supabase client for FM+ Budget v2 server-side use.
 * One-line indirection so we can swap the underlying client later
 * without touching every call site.
 */
export function budgetDb() {
  return supabaseAdmin();
}

/**
 * Table name constants. Use throughout the budget module instead of
 * raw string literals — gives IDE autocomplete + grep-ability.
 */
export const TABLES = {
  contracts: 'project_contracts',
  services:  'project_services',
  years:     'project_years',
  year_services: 'project_year_services',
  catalog:   'fmplus_catalog',
  overrides: 'project_catalog_overrides',
  lines:     'budget_lines',
  mob:       'mobilization_lines',
  audit:     'budget_audit',
  settings:  'budget_settings',
} as const;
