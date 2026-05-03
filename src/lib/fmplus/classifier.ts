// src/lib/fmplus/classifier.ts
//
// FMPLUS chart-of-accounts is deterministic by code prefix. This is the
// single source of truth for routing every account into a P&L section
// + subgroup. No name regex, no scope-aware branching — just numbers.
//
// Code prefix scheme (extracted from the user's Feb-2026 Excel export):
//   500-501  HK costs           510-511  MEP costs
//   520-521  Security costs     530-531  Landscape costs
//   540-541  Pest Control       550-551  Waste Management
//   560-561  Paid Services      570-571  Variation Order
//   600      Back Office Salaries        601  Office Rent & Utilities
//   602      Transportation              603  Marketing & Tender
//   604      Legal & Financial           605-606  Other G&A
//   607      Interest                    608-609  Depreciation
//
// Within service-line costs, the *third digit* picks the cost category:
//   0  Headcount (xx0001-xx0012)         1  Consumables (xx0101-xx0106)
//   2  Tools/Equipment (xx0201-xx0208) — INCLUDES depreciation rows;
//                                        flagged isDepreciation=true so
//                                        the no-dep toggle can pull them out
//   3  ICT (xx0301-xx0306)               4  Staff Accommodation (xx0401-xx0408)
//   5  Transportation (xx0501-xx0540)    6  Subcontractors (xx0601-xx0608)
//   9  Contracting Insurance (xx0901-xx0902)
//   10 Penalties (xx1001-xx1002)         11 Indirect Costs (xx1101-xx1103)

export type ServiceKey =
  | 'hk' | 'mep' | 'security' | 'landscape'
  | 'pest' | 'waste' | 'paid' | 'vo';

export type SectionKey =
  | 'revenue' | 'cost_of_revenue'
  | 'general_expenses' | 'interest_tax_dep';

export type Classification = {
  section: SectionKey;
  service?: ServiceKey;          // present for cost_of_revenue + service revenue rows
  serviceLabel?: string;
  subgroupKey: string;
  subgroupLabel: string;
  flip: boolean;                 // negate the raw debit-credit balance for display
                                 //   (income has credit-normal balance → display as positive)
  isDepreciation?: boolean;      // true if this is a 5xx02xx tools/equipment depreciation row
                                 //   no-dep toggle pulls these out of COGS into the bottom bucket
};

const SERVICE_PREFIX: Record<string, { key: ServiceKey; costLabel: string; shortLabel: string; revenueKeyword: RegExp }> = {
  '50': { key: 'hk',        costLabel: 'Cost of Housekeeping',     shortLabel: 'HK',              revenueKeyword: /house\s*keeping|\bhk\b/i },
  '51': { key: 'mep',       costLabel: 'Cost of MEP',              shortLabel: 'MEP',             revenueKeyword: /\bmep\b/i },
  '52': { key: 'security',  costLabel: 'Cost of Security',         shortLabel: 'Security',        revenueKeyword: /security/i },
  '53': { key: 'landscape', costLabel: 'Cost of Landscape',        shortLabel: 'Landscape',       revenueKeyword: /landscape/i },
  '54': { key: 'pest',      costLabel: 'Cost of Pest Control',     shortLabel: 'Pest Control',    revenueKeyword: /pest/i },
  '55': { key: 'waste',     costLabel: 'Cost of Waste Management', shortLabel: 'Waste Management',revenueKeyword: /waste/i },
  '56': { key: 'paid',      costLabel: 'Cost of PAID Services',    shortLabel: 'Paid Service',    revenueKeyword: /paid\s*service/i },
  '57': { key: 'vo',        costLabel: 'Cost of Variation Order',  shortLabel: 'Variation Order', revenueKeyword: /variation|varation/i },
};

const COST_CATEGORY: Record<string, { key: string; label: (svc: string) => string }> = {
  '0':  { key: 'headcount',       label: s => `${s} - Headcount Cost` },
  '1':  { key: 'consumables',     label: s => `${s} - Consumables` },
  '2':  { key: 'tools',           label: s => `${s} - Tools, Equipment - Depreciated Value` },
  '3':  { key: 'ict',             label: s => `${s} - Information and communication technology - ICT` },
  '4':  { key: 'staff_accom',     label: s => `${s} - Total Staff Accomodation` },
  '5':  { key: 'transport',       label: s => `${s} - Transportation and Fleet Management` },
  '6':  { key: 'subcontractors',  label: s => `${s} - Subcontractors and Outsourcing` },
  '9':  { key: 'insurance',       label: s => `${s} - Contracting Insurance` },
  '10': { key: 'penalties',       label: s => `${s} - Penalties` },
  '11': { key: 'indirect',        label: s => `${s} - Indirect Costs` },
};

function detectCostCategory(code: string): { entry: { key: string; label: (svc: string) => string } | null; key: string } {
  // Account codes are formatted {service:2}{category:2}{seq:rest}.
  // The category field is two chars at code[2..4]. Two-char keys '10' and '11'
  // (penalties, indirect) take precedence; otherwise the single-digit key
  // lives at code[3] — i.e. the second char of the category field, NOT the
  // first. The first char of the category field is always '0' for digits 0-9
  // (it's the leading zero of the zero-padded category number).
  const two = code.slice(2, 4);
  if (two === '10' || two === '11') {
    const entry = COST_CATEGORY[two];
    return { entry, key: entry.key };
  }
  const one = code.charAt(3);
  const entry = COST_CATEGORY[one];
  return entry ? { entry, key: entry.key } : { entry: null, key: 'other' };
}

export function classifyByPrefix(
  code: string,
  name: string,
  accountType: string
): Classification | null {
  // Balance-sheet account types are not P&L
  if (
    accountType.startsWith('asset_') ||
    accountType.startsWith('liability_') ||
    accountType === 'equity' ||
    accountType === 'equity_unaffected'
  ) {
    return null;
  }

  // Income → Revenue, split by service-name keyword. First-match-wins:
  // real Odoo revenue account names contain at most one service keyword.
  // Iteration order is the SERVICE_PREFIX object insertion order
  // (50, 51, 52, ..., 57) which gives HK precedence — matches Excel.
  if (accountType === 'income' || accountType === 'income_other') {
    if (accountType === 'income_other') {
      return {
        section: 'revenue',
        subgroupKey: 'other_revenue',
        subgroupLabel: 'Other Revenues',
        flip: true,
      };
    }
    for (const [, svc] of Object.entries(SERVICE_PREFIX)) {
      if (svc.revenueKeyword.test(name)) {
        return {
          section: 'revenue',
          service: svc.key,
          serviceLabel: `${svc.key.toUpperCase()} Revenue`,
          subgroupKey: 'service_revenue',
          subgroupLabel: 'Operation Revenue',
          flip: true,
        };
      }
    }
    return {
      section: 'revenue',
      subgroupKey: 'other_revenue',
      subgroupLabel: 'Other Revenues',
      flip: true,
    };
  }

  // Expense / direct cost / depreciation routes via prefix
  if (
    accountType !== 'expense' &&
    accountType !== 'expense_direct_cost' &&
    accountType !== 'expense_depreciation'
  ) {
    return null;
  }

  if (!/^\d{3,}/.test(code)) return null;

  const p2 = code.slice(0, 2);
  const p3 = code.slice(0, 3);

  // Service-line costs
  if (SERVICE_PREFIX[p2]) {
    const svc = SERVICE_PREFIX[p2];
    const { entry, key } = detectCostCategory(code);
    const subgroupLabel = entry ? entry.label(svc.shortLabel) : `${svc.shortLabel} - Other`;
    return {
      section: 'cost_of_revenue',
      service: svc.key,
      serviceLabel: svc.costLabel,
      subgroupKey: key,
      subgroupLabel,
      flip: false,
      ...(key === 'tools' ? { isDepreciation: true } : {}),
    };
  }

  // General expenses (600-606)
  if (p3 === '600') return { section: 'general_expenses', subgroupKey: 'back_office',     subgroupLabel: 'Back Office Salaries, Benefits',  flip: false };
  if (p3 === '601') return { section: 'general_expenses', subgroupKey: 'office_rent',     subgroupLabel: 'Office/Stores Rent & Utilities',  flip: false };
  if (p3 === '602') return { section: 'general_expenses', subgroupKey: 'transport_ga',    subgroupLabel: 'Transportation Expenses',          flip: false };
  if (p3 === '603') return { section: 'general_expenses', subgroupKey: 'marketing',       subgroupLabel: 'Marketing & Tender expenses',     flip: false };
  if (p3 === '604') return { section: 'general_expenses', subgroupKey: 'legal_financial', subgroupLabel: 'Legal & Financial Expenses',      flip: false };
  if (p3 === '605' || p3 === '606')
                    return { section: 'general_expenses', subgroupKey: 'other_ga',        subgroupLabel: 'Other Expenses',                   flip: false };

  // Interest / depreciation
  if (p3 === '607') return { section: 'interest_tax_dep', subgroupKey: 'interest',     subgroupLabel: 'Interest',     flip: false };
  if (p3 === '608' || p3 === '609')
                    return { section: 'interest_tax_dep', subgroupKey: 'depreciation', subgroupLabel: 'Depreciation', flip: false };

  return null;
}
