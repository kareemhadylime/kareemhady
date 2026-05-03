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

const SERVICE_PREFIX: Record<string, { key: ServiceKey; costLabel: string; revenueKeyword: RegExp }> = {
  '50': { key: 'hk',        costLabel: 'Cost of Housekeeping',     revenueKeyword: /house\s*keeping|\bhk\b/i },
  '51': { key: 'mep',       costLabel: 'Cost of MEP',              revenueKeyword: /\bmep\b/i },
  '52': { key: 'security',  costLabel: 'Cost of Security',         revenueKeyword: /security/i },
  '53': { key: 'landscape', costLabel: 'Cost of Landscape',        revenueKeyword: /landscape/i },
  '54': { key: 'pest',      costLabel: 'Cost of Pest Control',     revenueKeyword: /pest/i },
  '55': { key: 'waste',     costLabel: 'Cost of Waste Management', revenueKeyword: /waste/i },
  '56': { key: 'paid',      costLabel: 'Cost of PAID Services',    revenueKeyword: /paid\s*service/i },
  '57': { key: 'vo',        costLabel: 'Cost of Variation Order',  revenueKeyword: /variation|var(a|i)ation/i },
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

function detectCostCategory(code: string): { key: string; label: string } {
  // Service-line costs: code is 6 digits like '500001'.
  // Format is "{service:2}{category:2}{seq:2}".
  // The category at positions [2:4] is interpreted as:
  //   - '0X' where X is a digit 0-9: use X as the category key
  //   - '10', '11': use these exactly as category keys
  // Examples:
  //   500001 → service=50, category='00' → key='0' (headcount)
  //   500201 → service=50, category='02' → key='2' (tools)
  //   510601 → service=51, category='06' → key='6' (subcontractors)
  //   521001 → service=52, category='10' → key='10' (penalties)
  //   570001 → service=57, category='00' → key='0' (headcount)
  const categoryStr = code.slice(2, 4);

  // For '10' and '11', use them directly
  if (categoryStr === '10' || categoryStr === '11') {
    const cat = COST_CATEGORY[categoryStr];
    return { key: cat.key, label: '' };
  }

  // For '0X' format, use the second digit (X) as the key
  const categoryKey = categoryStr[1];
  const cat = COST_CATEGORY[categoryKey];
  if (!cat) return { key: 'other', label: '' };
  return { key: cat.key, label: '' };
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

  // Income → Revenue, split by service-name keyword
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
    const cat = detectCostCategory(code);
    const labelFn = COST_CATEGORY[cat.key === 'penalties' ? '10' : cat.key === 'indirect' ? '11' : Object.keys(COST_CATEGORY).find(k => COST_CATEGORY[k].key === cat.key) || '0'];
    const svcShort = svc.key.toUpperCase().replace('VO', 'Variation Order').replace('PAID', 'Paid Service');
    const result: Classification = {
      section: 'cost_of_revenue',
      service: svc.key,
      serviceLabel: svc.costLabel,
      subgroupKey: cat.key,
      subgroupLabel: labelFn ? labelFn.label(svcShort) : `${svcShort} - ${cat.key}`,
      flip: false,
    };
    if (cat.key === 'tools') {
      result.isDepreciation = true;
    }
    return result;
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
