import { budgetDb, TABLES } from '../db';
import type { ServiceLine, Category } from '../types';
import type { FmplusCatalogItem } from '../schema';

export interface CatalogSearchOpts {
  q?: string;
  service_line?: ServiceLine;
  category?: Category;
  is_active?: boolean;
  limit?: number;
}

/**
 * Server-side catalog search. Filters by free-text (across name_en/name_ar/code/tags),
 * service line, category, and active state. Returns up to `limit` rows (default 200).
 * Service-role context — caller should already have `requireBudgetView()` gate upstream.
 */
export async function searchCatalog(opts: CatalogSearchOpts = {}): Promise<FmplusCatalogItem[]> {
  const sb = budgetDb();
  let q = sb.from(TABLES.catalog).select('*').limit(opts.limit ?? 200).order('name_en');
  if (opts.is_active !== false) q = q.eq('is_active', true);
  if (opts.service_line) q = q.contains('service_lines', [opts.service_line]);
  if (opts.category) q = q.eq('category', opts.category);
  if (opts.q && opts.q.trim()) {
    const term = opts.q.trim().replace(/[%,]/g, ' ');
    q = q.or(`name_en.ilike.%${term}%,name_ar.ilike.%${term}%,code.ilike.%${term}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as FmplusCatalogItem[];
}
