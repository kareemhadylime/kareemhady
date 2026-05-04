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
  account_map_json: [
    { category: 'manning',      code_patterns: ['^5060[0-9]{2}$'] },
    { category: 'it',           code_patterns: ['^5063[0-9]{2}$'] },
    { category: 'tools',        code_patterns: ['^5061[0-9]{2}$'] },
    { category: 'governmental', code_patterns: ['^5006[0-9]{2}$'] },
  ],
};
