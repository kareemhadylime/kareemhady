import type { Template } from '../schema';

export const backOfficeTemplate: Template = {
  service_line: 'back_office',
  version: 1,
  vat_pct: 14,
  default_seasons: { high: [9,10,11,12,1,2,3,4], low: [5,6,7,8] },
  categories: [
    {
      code: 'manning',
      label_en: 'Manning',
      label_ar: 'الإدارة',
      lines: [
        { code: 'bo_director',   label_en: 'Operations Director', label_ar: 'مدير عام',               default_qty: 1 },
        { code: 'bo_ops_manager', label_en: 'Ops Manager',        label_ar: 'مدير عمليات',            default_qty: 1 },
        { code: 'bo_hr',         label_en: 'HR Officer',          label_ar: 'مسؤول موارد بشرية',     default_qty: 1 },
        { code: 'bo_accountant', label_en: 'Accountant',          label_ar: 'محاسب',                  default_qty: 2 },
        { code: 'bo_admin',      label_en: 'Admin Assistant',     label_ar: 'إداري',                  default_qty: 2 },
      ],
    },
    {
      code: 'it',
      label_en: 'IT & Communication',
      label_ar: 'تقنية المعلومات والاتصال',
      lines: [
        { code: 'it_per_head',      label_en: 'Laptop / Mobile / SIM (per head)', label_ar: 'أجهزة لكل موظف',    default_unit_cost: 350 },
        { code: 'it_software_subs', label_en: 'Software Subscriptions',           label_ar: 'اشتراكات',           default_unit_cost: 1200 },
        { code: 'it_accounting_sw', label_en: 'Accounting Software License',      label_ar: 'محاسبة',             default_unit_cost: 2500 },
      ],
    },
    {
      code: 'tools',
      label_en: 'Office Tools & Equipment',
      label_ar: 'الأدوات والمعدات المكتبية',
      lines: [
        { code: 'tool_office_desk',       label_en: 'Office Desk',          label_ar: 'مكتب',     default_unit_cost: 2800 },
        { code: 'tool_office_chair',      label_en: 'Office Chair',         label_ar: 'كرسي',     default_unit_cost: 1500 },
        { code: 'tool_printer',           label_en: 'Printer',              label_ar: 'طابعة',    default_unit_cost: 4500 },
        { code: 'tool_office_stationery', label_en: 'Stationery (monthly)', label_ar: 'قرطاسية', default_unit_cost: 850 },
      ],
    },
    // governmental category injected post-merge in templates/index.ts (Task 11)
  ],
  // Odoo COA: General-Expense codes are 3-digit-prefixed (600-606), distinct
  // from the 50-57 service-line scheme. Back-Office maps to 600 (salaries),
  // 601 (rent/utilities), 602 (transport G&A), 603 (marketing/tender),
  // 604 (legal/financial), 605/606 (other G&A) — see classifier.ts.
  account_map_json: [
    { category: 'manning', code_patterns: ['^600[0-9]{3}$'] },
    { category: 'other',   code_patterns: ['^601[0-9]{3}$'] },
    { category: 'transport', code_patterns: ['^602[0-9]{3}$'] },
    { category: 'other',   code_patterns: ['^603[0-9]{3}$', '^604[0-9]{3}$', '^605[0-9]{3}$', '^606[0-9]{3}$'] },
  ],
};
