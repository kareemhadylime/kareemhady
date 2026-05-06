import type { Template } from '../schema';

export const pestCtrlTemplate: Template = {
  service_line: 'pest_ctrl',
  version: 1,
  vat_pct: 14,
  default_seasons: { high: [9,10,11,12,1,2,3,4], low: [5,6,7,8] },
  categories: [
    {
      code: 'manning',
      label_en: 'Manning',
      label_ar: 'العمالة',
      lines: [
        { code: 'pest_supervisor', label_en: 'Supervisor',       label_ar: 'مشرف',          default_qty: 1 },
        { code: 'pest_technician', label_en: 'Pest Technician',  label_ar: 'فني مكافحة',    default_qty: 3 },
        { code: 'pest_helper',     label_en: 'Helper',           label_ar: 'مساعد',          default_qty: 2 },
      ],
    },
    {
      code: 'tools',
      label_en: 'Tools & Equipment',
      label_ar: 'الأدوات والمعدات',
      lines: [
        { code: 'tool_sprayer_backpack',  label_en: 'Backpack Sprayer',     label_ar: 'رشاش ظهري',  default_unit_cost: 1200 },
        { code: 'tool_sprayer_motorized', label_en: 'Motorized Sprayer',    label_ar: 'رشاش آلي',   default_unit_cost: 4800 },
        { code: 'tool_traps',             label_en: 'Rodent Traps (pack)',  label_ar: 'مصايد',       default_unit_cost: 280 },
      ],
    },
    {
      code: 'consumables',
      label_en: 'Consumables & Chemicals',
      label_ar: 'المستهلكات والمبيدات',
      lines: [
        { code: 'cons_insecticide',   label_en: 'Insecticide (L)',    label_ar: 'مبيد حشرات',   default_unit_cost: 380 },
        { code: 'cons_rodenticide',   label_en: 'Rodenticide (kg)',   label_ar: 'مبيد قوارض',   default_unit_cost: 320 },
        { code: 'cons_fungicide',     label_en: 'Fungicide (L)',      label_ar: 'مبيد فطريات',  default_unit_cost: 420 },
        { code: 'cons_disinfectant',  label_en: 'Disinfectant (L)',   label_ar: 'معقم',          default_unit_cost: 95 },
      ],
    },
    {
      code: 'transport',
      label_en: 'Transportation & Vehicles',
      label_ar: 'النقل والمركبات',
      lines: [
        { code: 'veh_van', label_en: 'Van',  label_ar: 'فان',  default_unit_cost: 14500 },
        { code: 'fuel',    label_en: 'Fuel', label_ar: 'وقود', default_unit_cost: 5500 },
      ],
    },
    // governmental category injected post-merge in templates/index.ts (Task 11)
  ],
  // Odoo COA: service prefix '54' = Pest Control.
  account_map_json: [
    { category: 'manning',      code_patterns: ['^5400[0-9]{2}$'] },
    { category: 'consumables',  code_patterns: ['^5401[0-9]{2}$'] },
    { category: 'tools',        code_patterns: ['^5402[0-9]{2}$'] },
    { category: 'it',           code_patterns: ['^5403[0-9]{2}$'] },
    { category: 'transport',    code_patterns: ['^5405[0-9]{2}$'] },
  ],
};
