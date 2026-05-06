import { budgetDb, TABLES } from '../db';
import { applyInflation, type InflationKnobs } from '../inflation-calc';

export interface CopyYearInput {
  source_year_id: number;
  target_year_index: number;
  knobs: InflationKnobs;
  per_line_override_pct: Record<string, number>;
  reasons?: Record<string, string>;
}

export interface CopyYearResult {
  year_id: number;
  year_index: number;
  lines_copied: number;
  revenue_rows_copied: number;
}

/**
 * Create a new project_years row at `target_year_index` for the same contract
 * as `source_year_id`, copying all year_services + budget_lines forward with
 * inflation applied per the knobs (and optional per-line overrides).
 *
 * Refuses if a year at target_year_index already exists for the same contract
 * (scenario='initial'). Logs the inflation knobs + overrides + reasons to
 * budget_audit on the target year.
 *
 * Mobilization is contract-level — it is NOT duplicated. The new year inherits
 * the same mobilization_lines via the contract relationship.
 */
export async function copyYear(opts: CopyYearInput): Promise<CopyYearResult> {
  const sb = budgetDb();

  // Load source year
  const { data: srcYear, error: srcErr } = await sb.from(TABLES.years)
    .select('*')
    .eq('id', opts.source_year_id)
    .single();
  if (srcErr || !srcYear) throw new Error('source_year_not_found');

  // Reject if target year already exists for this contract
  const { data: existing } = await sb.from(TABLES.years)
    .select('id')
    .eq('contract_id', srcYear.contract_id)
    .eq('year_index', opts.target_year_index)
    .eq('scenario', 'initial')
    .maybeSingle();
  if (existing) throw new Error(`Year ${opts.target_year_index} already exists for this contract.`);

  // Create target year (draft)
  const { data: tgtYear, error: tErr } = await sb.from(TABLES.years).insert({
    contract_id: srcYear.contract_id,
    year_index: opts.target_year_index,
    fiscal_year: srcYear.fiscal_year ? srcYear.fiscal_year + 1 : null,
    start_month: srcYear.start_month,
    scenario: 'initial',
    status: 'draft',
  }).select().single();
  if (tErr || !tgtYear) throw tErr ?? new Error('failed_to_create_target_year');

  // Copy year_services with revenue inflation
  const { data: srcRev } = await sb.from(TABLES.year_services)
    .select('*')
    .eq('year_id', opts.source_year_id);
  let revCopied = 0;
  if (srcRev?.length) {
    const newRev = srcRev.map((r) => ({
      year_id: tgtYear.id,
      service_line: r.service_line,
      monthly_revenue: Number(r.monthly_revenue) * (1 + opts.knobs.revenue / 100),
      vat_pct: r.vat_pct,
      manpower_ramp: r.manpower_ramp ?? {},
    }));
    const { error: revErr } = await sb.from(TABLES.year_services).insert(newRev);
    if (revErr) {
      await sb.from(TABLES.years).delete().eq('id', tgtYear.id);
      throw revErr;
    }
    revCopied = newRev.length;
  }

  // Copy budget_lines with category-aware inflation
  const { data: srcLines } = await sb.from(TABLES.lines)
    .select('*')
    .eq('year_id', opts.source_year_id);
  let linesCopied = 0;
  if (srcLines?.length) {
    const projected = srcLines.map((l) => {
      const inflated = applyInflation(
        {
          line_code: l.line_code,
          service_line: l.service_line,
          category: l.category,
          qty: Number(l.qty),
          unit_cost: Number(l.unit_cost),
        },
        opts.knobs,
        opts.per_line_override_pct,
      );
      return {
        year_id: tgtYear.id,
        service_line: l.service_line,
        category: l.category,
        line_code: l.line_code,
        catalog_item_id: l.catalog_item_id,
        label_en: l.label_en,
        label_ar: l.label_ar,
        season: l.season,
        qty: l.qty,
        unit_cost: inflated.unit_cost,
        ctc_net: l.ctc_net,
        ctc_relievers: l.ctc_relievers,
        ctc_ot: l.ctc_ot,
        ctc_training: l.ctc_training,
        ctc_insurance: l.ctc_insurance,
        ctc_medical: l.ctc_medical,
        threshold_green: l.threshold_green,
        threshold_amber: l.threshold_amber,
        notes: l.notes,
      };
    });
    const { error: lErr } = await sb.from(TABLES.lines).insert(projected);
    if (lErr) {
      await sb.from(TABLES.years).delete().eq('id', tgtYear.id);
      throw lErr;
    }
    linesCopied = projected.length;
  }

  // Audit log for the copy itself
  await sb.from(TABLES.audit).insert({
    year_id: tgtYear.id,
    diff_json: {
      action: 'copy_year',
      source_year_id: opts.source_year_id,
      knobs: opts.knobs,
      per_line_overrides: opts.per_line_override_pct,
      reasons: opts.reasons ?? {},
      lines_copied: linesCopied,
      revenue_rows_copied: revCopied,
    },
  });

  return {
    year_id: tgtYear.id,
    year_index: tgtYear.year_index,
    lines_copied: linesCopied,
    revenue_rows_copied: revCopied,
  };
}
