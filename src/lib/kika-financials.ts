import { supabaseAdmin } from './supabase';

// Kika financials — Odoo company 6 "X Label for Tailoring Kika". Three
// lines of business in a single Odoo company, segmented via analytic
// accounts:
//   - kika         → women's garments sold via shopfromkika (Shopify)
//   - xlabel       → uniforms factory (B2B wholesale)
//   - inout        → outsource manufacturing (customer brings materials)
// The source-of-truth P&L lives in `XLABEL KIKA Financial Statement.xlsx`.
//
// Uses the same Odoo mirror tables as Beithady (odoo_move_lines,
// odoo_accounts) + the analytic link projection (odoo_move_line_analytics
// → odoo_analytic_accounts) for segmentation.

export const KIKA_COMPANY_IDS = [6];

export type KikaSegment = 'consolidated' | 'inout' | 'xlabel' | 'kika';

export function kikaSegmentLabel(s: KikaSegment): string {
  switch (s) {
    case 'consolidated':
      return 'X Label for Tailoring Kika (all segments)';
    case 'inout':
      return 'IN & OUT Transactions (outsource manufacturing)';
    case 'xlabel':
      return 'X Label (uniforms factory)';
    case 'kika':
      return 'Kika (shopfromkika Shopify)';
  }
}

// Classify a Kika analytic account into one of the three segments. Tenants
// typically name analytic accounts after the segment, so we match by
// keyword. If the name doesn't hit any, it contributes only to consolidated.
export function classifyKikaSegment(
  analyticName: string | null | undefined
): KikaSegment | null {
  const n = String(analyticName || '').toLowerCase();
  if (!n) return null;
  if (/in\W*out|inout|outsource/.test(n)) return 'inout';
  if (/x[-\s]*label|xlabel/.test(n)) return 'xlabel';
  if (/\bkika\b|shopfromkika|shopify/.test(n)) return 'kika';
  return null;
}

// Kika P&L section taxonomy — mirrors the xlsx + Kika's Odoo CoA prefixes
// which differ from Beithady's.
export type KikaPnlLeaf = {
  code: string;
  name: string;
  account_type: string;
  balance: number; // sign-normalized (income positive, expenses positive)
};
export type KikaPnlSubgroup = {
  key: string;
  label: string;
  total: number;
  accounts: KikaPnlLeaf[];
};
export type KikaPnlSection = {
  key: string;
  label: string;
  total: number;
  subgroups: KikaPnlSubgroup[];
};
export type KikaPnlReport = {
  period: { from: string; to: string; label: string };
  segment: KikaSegment;
  company_ids: number[];
  sections: {
    revenue: KikaPnlSection;
    cost_of_revenue: KikaPnlSection;
    general_expenses: KikaPnlSection;
    interest_tax_dep: KikaPnlSection;
  };
  totals: {
    revenue: number;
    cost_of_revenue: number;
    gross_profit: number;
    general_expenses: number;
    ebitda: number;
    interest_tax_dep: number;
    net_profit: number;
  };
  line_count: number;
  unclassified: KikaPnlLeaf[];
};

type SectionKey = keyof KikaPnlReport['sections'];

function classifyKikaAccount(
  code: string,
  name: string,
  accountType: string
): {
  section: SectionKey;
  subgroupKey: string;
  subgroupLabel: string;
  flip: boolean;
} | null {
  const n = (name || '').toLowerCase();
  const c = (code || '').trim();

  switch (accountType) {
    case 'income':
    case 'income_other':
      if (c.startsWith('401010') || /shopify/.test(n)) {
        return {
          section: 'revenue',
          subgroupKey: 'shopify',
          subgroupLabel: 'Shopify Online Orders',
          flip: true,
        };
      }
      if (c.startsWith('401020')) {
        return {
          section: 'revenue',
          subgroupKey: 'shopify',
          subgroupLabel: 'Shopify Online Orders',
          flip: true,
        };
      }
      if (c.startsWith('401030') || /corporate/.test(n)) {
        return {
          section: 'revenue',
          subgroupKey: 'corporate',
          subgroupLabel: 'Corporate Deals',
          flip: true,
        };
      }
      return {
        section: 'revenue',
        subgroupKey: 'other',
        subgroupLabel: 'Other Revenues',
        flip: true,
      };
    case 'expense_direct_cost': {
      if (c.startsWith('501') || /raw material|direct labor|manufacturing overhead/i.test(n)) {
        return {
          section: 'cost_of_revenue',
          subgroupKey: 'cogs',
          subgroupLabel: 'Cost of Goods Sold',
          flip: false,
        };
      }
      if (c.startsWith('502') || /repair|freight|shipping|commission|depreciation equipment/i.test(n)) {
        return {
          section: 'cost_of_revenue',
          subgroupKey: 'cost_of_operation',
          subgroupLabel: 'Cost of Operation',
          flip: false,
        };
      }
      return {
        section: 'cost_of_revenue',
        subgroupKey: 'other_direct',
        subgroupLabel: 'Other Direct Cost',
        flip: false,
      };
    }
    case 'expense': {
      if (c.startsWith('601') || /advertis|marketing|samples|shooting|complimentary|interest on finance|cleaning/i.test(n)) {
        return {
          section: 'general_expenses',
          subgroupKey: 'marketing',
          subgroupLabel: 'Marketing, Ads & Tender',
          flip: false,
        };
      }
      if (c.startsWith('602') || /legal|subscription|bank fees|instapay|rounding|other expense/i.test(n)) {
        return {
          section: 'general_expenses',
          subgroupKey: 'other',
          subgroupLabel: 'Other Expenses',
          flip: false,
        };
      }
      if (c.startsWith('603') || /rent expense|mobile|water|electricty|office expense|office supplies|consumables tool/i.test(n)) {
        return {
          section: 'general_expenses',
          subgroupKey: 'office_rent',
          subgroupLabel: 'Office/Stores Rent & Utilities',
          flip: false,
        };
      }
      if (c.startsWith('604') || /office.*salaries|office.*store|buffet|food allowance/i.test(n)) {
        return {
          section: 'general_expenses',
          subgroupKey: 'back_office',
          subgroupLabel: 'Back Office Salaries & Benefits',
          flip: false,
        };
      }
      if (c.startsWith('605') || /traffic|transportation|oil.*gas|parking|repair.*maint.*car/i.test(n)) {
        return {
          section: 'general_expenses',
          subgroupKey: 'transport',
          subgroupLabel: 'Transportation Expenses',
          flip: false,
        };
      }
      if (/interest/i.test(n)) {
        return {
          section: 'interest_tax_dep',
          subgroupKey: 'interest',
          subgroupLabel: 'Interest',
          flip: false,
        };
      }
      return {
        section: 'general_expenses',
        subgroupKey: 'other',
        subgroupLabel: 'Other Expenses',
        flip: false,
      };
    }
    case 'expense_depreciation':
      // Manufacturing-equipment depreciation (502xxx) belongs to Cost of
      // Operation — it's a direct cost of production, not a below-EBITDA
      // item. Office/IT-equipment depreciation (606xxx) stays as a standalone
      // INT-TAX-DEP line. Matches the f.s_x_label_for_tailoring_kika xlsx
      // presentation where 502120 sits inside Cost of Revenue.
      if (c.startsWith('502')) {
        return {
          section: 'cost_of_revenue',
          subgroupKey: 'cost_of_operation',
          subgroupLabel: 'Cost of Operation',
          flip: false,
        };
      }
      return {
        section: 'interest_tax_dep',
        subgroupKey: 'depreciation',
        subgroupLabel: 'Depreciation',
        flip: false,
      };
    default:
      return null;
  }
}

const SECTION_LABEL: Record<SectionKey, string> = {
  revenue: 'Revenue',
  cost_of_revenue: 'Cost Of Revenue',
  general_expenses: 'General Expenses',
  interest_tax_dep: 'INT - TAXES - DEP - ADJ',
};

const SUBGROUP_ORDER: Record<SectionKey, string[]> = {
  revenue: ['shopify', 'corporate', 'other'],
  cost_of_revenue: ['cogs', 'cost_of_operation', 'other_direct'],
  general_expenses: [
    'marketing',
    'other',
    'office_rent',
    'back_office',
    'transport',
  ],
  interest_tax_dep: ['interest', 'depreciation'],
};

type RawAggregate = {
  code: string;
  name: string;
  account_type: string;
  sum_balance: number;
};

// Fetch move-line-level totals for Kika (company 6) in a period. When a
// segment filter is active, restrict to move_lines whose analytic
// distribution maps to an analytic account matching the segment keyword.
async function fetchKikaAccountTotals(params: {
  fromDate: string;
  toDate: string;
  segment: KikaSegment;
}): Promise<{ rows: RawAggregate[]; lineCount: number }> {
  const sb = supabaseAdmin();

  // Resolve analytic_account_ids matching the segment (if any).
  //   company_ids is a Postgres bigint[] — use array containment (@>) via
  //   Supabase's .contains() helper. The previous .in('company_ids', [[6]])
  //   call generated a scalar IN filter that returned zero analytic rows,
  //   so every non-consolidated segment rendered blank.
  let analyticIds: number[] | null = null;
  if (params.segment !== 'consolidated') {
    const { data: analyticRows } = await sb
      .from('odoo_analytic_accounts')
      .select('id, name')
      .contains('company_ids', [6]);
    const ids: number[] = [];
    for (const a of (analyticRows as Array<{ id: number; name: string }> | null) || []) {
      const seg = classifyKikaSegment(a.name);
      if (seg === params.segment) ids.push(Number(a.id));
    }
    analyticIds = ids;
    // If no analytic accounts matched, return empty (no data for segment)
    if (analyticIds.length === 0) {
      return { rows: [], lineCount: 0 };
    }
  }

  // Segment mode: join odoo_move_lines through odoo_move_line_analytics.
  // Weight each move-line by its analytic-distribution percentage so that
  // a 50/50 split between kika and xlabel contributes only half its
  // balance to each segment — otherwise every segment double-counts the
  // full balance and segments no longer sum to consolidated. Verified in
  // SQL: weighted SUM(kika) + SUM(xlabel) + SUM(inout) ≈ consolidated.
  if (analyticIds && analyticIds.length > 0) {
    const byAccount = new Map<string, RawAggregate>();
    let lineCount = 0;
    const PAGE = 1000;
    let offset = 0;
    while (true) {
      const { data, error } = await sb
        .from('odoo_move_line_analytics')
        .select(
          'move_line_id, percentage, odoo_move_lines!inner(balance, date, company_id, parent_state, odoo_accounts!inner(code, name, account_type))'
        )
        .in('analytic_account_id', analyticIds)
        .gte('odoo_move_lines.date', params.fromDate)
        .lte('odoo_move_lines.date', params.toDate)
        .eq('odoo_move_lines.company_id', 6)
        .in('odoo_move_lines.parent_state', ['draft', 'posted'])
        .range(offset, offset + PAGE - 1);
      if (error) throw new Error(`fetchKikaAccountTotals: ${error.message}`);
      const rows = (data as unknown as Array<{
        percentage: number | string | null;
        odoo_move_lines: {
          balance: number;
          odoo_accounts: { code: string | null; name: string; account_type: string | null } | null;
        } | null;
      }>) || [];
      if (rows.length === 0) break;
      for (const r of rows) {
        const ml = r.odoo_move_lines;
        const acc = ml?.odoo_accounts;
        if (!ml || !acc) continue;
        const code = acc.code || '';
        const name = acc.name || '';
        const accountType = acc.account_type || '';
        const key = `${code}||${name}||${accountType}`;
        const rawBal = Number(ml.balance) || 0;
        const pct = Number(r.percentage);
        // If percentage is missing (shouldn't happen for real rows) fall
        // back to 100% so the row isn't silently dropped.
        const share = Number.isFinite(pct) && pct > 0 ? pct / 100 : 1;
        const weighted = rawBal * share;
        const existing = byAccount.get(key);
        if (existing) existing.sum_balance += weighted;
        else byAccount.set(key, { code, name, account_type: accountType, sum_balance: weighted });
      }
      lineCount += rows.length;
      if (rows.length < PAGE) break;
      offset += PAGE;
    }
    return { rows: Array.from(byAccount.values()), lineCount };
  }

  // Consolidated: aggregate all move lines for company 6 without analytic filter.
  const PAGE = 1000;
  let offset = 0;
  const byAccount = new Map<string, RawAggregate>();
  let lineCount = 0;
  while (true) {
    const { data, error } = await sb
      .from('odoo_move_lines')
      .select('balance, odoo_accounts!inner(code, name, account_type)')
      .gte('date', params.fromDate)
      .lte('date', params.toDate)
      .eq('company_id', 6)
      .in('parent_state', ['draft', 'posted'])
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`fetchKikaAccountTotals: ${error.message}`);
    const rows = (data as unknown as Array<{
      balance: number;
      odoo_accounts: { code: string | null; name: string; account_type: string | null } | null;
    }>) || [];
    if (rows.length === 0) break;
    for (const r of rows) {
      if (!r.odoo_accounts) continue;
      const code = r.odoo_accounts.code || '';
      const name = r.odoo_accounts.name || '';
      const accountType = r.odoo_accounts.account_type || '';
      const key = `${code}||${name}||${accountType}`;
      const existing = byAccount.get(key);
      const bal = Number(r.balance) || 0;
      if (existing) existing.sum_balance += bal;
      else byAccount.set(key, { code, name, account_type: accountType, sum_balance: bal });
    }
    lineCount += rows.length;
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return { rows: Array.from(byAccount.values()), lineCount };
}

export async function buildKikaPnlReport(params: {
  fromDate: string;
  toDate: string;
  label: string;
  segment?: KikaSegment;
}): Promise<KikaPnlReport> {
  const segment = params.segment || 'consolidated';
  const { rows, lineCount } = await fetchKikaAccountTotals({
    fromDate: params.fromDate,
    toDate: params.toDate,
    segment,
  });

  const emptySection = (key: SectionKey): KikaPnlSection => ({
    key,
    label: SECTION_LABEL[key],
    total: 0,
    subgroups: [],
  });

  const sections: KikaPnlReport['sections'] = {
    revenue: emptySection('revenue'),
    cost_of_revenue: emptySection('cost_of_revenue'),
    general_expenses: emptySection('general_expenses'),
    interest_tax_dep: emptySection('interest_tax_dep'),
  };
  const unclassified: KikaPnlLeaf[] = [];

  for (const r of rows) {
    const cls = classifyKikaAccount(r.code, r.name, r.account_type);
    if (!cls) continue;
    const display = cls.flip ? -r.sum_balance : r.sum_balance;
    if (Math.abs(display) < 0.005) continue;
    const section = sections[cls.section];
    let sg = section.subgroups.find(s => s.key === cls.subgroupKey);
    if (!sg) {
      sg = {
        key: cls.subgroupKey,
        label: cls.subgroupLabel,
        total: 0,
        accounts: [],
      };
      section.subgroups.push(sg);
    }
    sg.accounts.push({
      code: r.code,
      name: r.name,
      account_type: r.account_type,
      balance: display,
    });
    sg.total += display;
    section.total += display;
  }

  // Sort
  for (const secKey of Object.keys(sections) as SectionKey[]) {
    const order = SUBGROUP_ORDER[secKey];
    const orderMap = new Map<string, number>(order.map((k, i) => [k, i]));
    sections[secKey].subgroups.sort(
      (a, b) => (orderMap.get(a.key) ?? 99) - (orderMap.get(b.key) ?? 99)
    );
    for (const sg of sections[secKey].subgroups) {
      sg.accounts.sort((a, b) => a.code.localeCompare(b.code));
    }
  }

  const totals = {
    revenue: sections.revenue.total,
    cost_of_revenue: sections.cost_of_revenue.total,
    gross_profit: sections.revenue.total - sections.cost_of_revenue.total,
    general_expenses: sections.general_expenses.total,
    ebitda:
      sections.revenue.total -
      sections.cost_of_revenue.total -
      sections.general_expenses.total,
    interest_tax_dep: sections.interest_tax_dep.total,
    net_profit:
      sections.revenue.total -
      sections.cost_of_revenue.total -
      sections.general_expenses.total -
      sections.interest_tax_dep.total,
  };

  return {
    period: { from: params.fromDate, to: params.toDate, label: params.label },
    segment,
    company_ids: KIKA_COMPANY_IDS,
    sections,
    totals,
    line_count: lineCount,
    unclassified: unclassified.sort((a, b) => a.code.localeCompare(b.code)),
  };
}

// ---- Period helper — re-use Beithady's if ever needed; for now inline.

export type KikaPeriod = {
  id: string;
  label: string;
  fromDate: string;
  toDate: string;
};

export function resolveKikaPeriod(
  preset: string | undefined,
  fromParam: string | undefined,
  toParam: string | undefined,
  now: Date = new Date()
): KikaPeriod {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const firstOfMonth = (yy: number, mm: number) => `${yy}-${pad(mm + 1)}-01`;
  const lastOfMonth = (yy: number, mm: number) => {
    const d = new Date(Date.UTC(yy, mm + 1, 0));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(
      d.getUTCDate()
    )}`;
  };
  const makeMonth = (yy: number, mm: number, label: string): KikaPeriod => ({
    id: `month-${yy}-${pad(mm + 1)}`,
    label,
    fromDate: firstOfMonth(yy, mm),
    toDate: lastOfMonth(yy, mm),
  });
  if (preset === 'custom' && fromParam && toParam) {
    return { id: 'custom', label: `${fromParam} → ${toParam}`, fromDate: fromParam, toDate: toParam };
  }
  if (preset && preset.startsWith('month:')) {
    const [yStr, mStr] = preset.slice(6).split('-');
    const yy = Number(yStr);
    const mm = Number(mStr) - 1;
    if (Number.isFinite(yy) && Number.isFinite(mm) && mm >= 0 && mm <= 11) {
      const d = new Date(Date.UTC(yy, mm, 1));
      return makeMonth(
        yy,
        mm,
        d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      );
    }
  }
  switch (preset) {
    case 'last_month': {
      const d = new Date(Date.UTC(y, m - 1, 1));
      return makeMonth(
        d.getUTCFullYear(),
        d.getUTCMonth(),
        d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      );
    }
    case 'this_year':
      return { id: 'this_year', label: `${y}`, fromDate: `${y}-01-01`, toDate: `${y}-12-31` };
    case 'this_month':
    default: {
      const d = new Date(Date.UTC(y, m, 1));
      return makeMonth(
        y,
        m,
        d.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      );
    }
  }
}
