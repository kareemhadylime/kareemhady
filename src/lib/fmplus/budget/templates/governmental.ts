import type { TemplateCategorySchema } from '../schema';
import type { z } from 'zod';

/**
 * Governmental Expenses category — post-merged onto every service-line template
 * by getTemplate() in templates/index.ts. Default lines reflect the typical
 * Egyptian FM contract obligations:
 *   - تامينات مقاولات (Contractor Insurance) — 1.4% of revenue
 *   - دمغات وضرائب (Tax Stamps) — flat
 *   - تصاريح عمل (Work Permits) — flat
 * User can delete inapplicable lines per project.
 */
export const governmentalCategory: z.infer<typeof TemplateCategorySchema> = {
  code: 'governmental',
  label_en: 'Governmental Expenses',
  label_ar: 'المصروفات الحكومية',
  lines: [
    { code: 'gov_taminat',     label_en: 'Contractor Insurance (1.4% of revenue)', label_ar: 'تامينات مقاولات' },
    { code: 'gov_tax_stamps',  label_en: 'Tax Stamps',          label_ar: 'دمغات وضرائب' },
    { code: 'gov_work_permit', label_en: 'Work Permits',        label_ar: 'تصاريح عمل' },
  ],
};
