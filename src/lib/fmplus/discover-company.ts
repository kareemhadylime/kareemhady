import { supabaseAdmin } from '../supabase';
import { odooSearchRead, type OdooCompany } from '../odoo';

const FMPLUS_NAME_PATTERN = 'FMPLUS Property%';

// Returns the Odoo company.id for "FMPLUS Property & Facility Management".
// Cached in odoo_companies after first call. Throws if not found in Odoo.
//
// Usage: called once per cold start by the sync (Task 7) and by page
// components that need to scope queries to the FMPLUS company.
export async function discoverFmplusCompanyId(): Promise<number> {
  const sb = supabaseAdmin();

  // Warm path — already synced.
  const { data: cached } = await sb
    .from('odoo_companies')
    .select('id')
    .ilike('name', 'fmplus property%')
    .maybeSingle();
  if (cached?.id) return Number(cached.id);

  // Cold path — query Odoo.
  const rows = await odooSearchRead<OdooCompany>(
    'res.company',
    [['name', 'ilike', FMPLUS_NAME_PATTERN]],
    { fields: ['name', 'country_id', 'currency_id', 'partner_id'], limit: 1 }
  );
  if (!rows[0]) {
    throw new Error(
      'discoverFmplusCompanyId: no res.company found matching "FMPLUS Property%". ' +
      'Verify the company exists in the Odoo tenant and the API user has access.'
    );
  }

  // Persist to odoo_companies so subsequent calls hit the warm path.
  const company = rows[0];
  await sb.from('odoo_companies').upsert(
    {
      id: company.id,
      name: company.name || 'FMPLUS Property & Facility Management',
      country: Array.isArray(company.country_id) ? company.country_id[1] : null,
      currency: Array.isArray(company.currency_id) ? company.currency_id[1] : null,
      partner_id: Array.isArray(company.partner_id) ? company.partner_id[0] : null,
      in_scope: true,
      last_synced_at: new Date().toISOString(),
    },
    { onConflict: 'id' }
  );
  return company.id;
}
