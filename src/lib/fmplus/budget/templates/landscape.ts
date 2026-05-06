import type { Template } from '../schema';

export const landscapeTemplate: Template = {
  service_line: 'landscape',
  version: 1,
  vat_pct: 14,
  default_seasons: { high: [9,10,11,12,1,2,3,4], low: [5,6,7,8] },
  categories: [
    {
      code: 'manning',
      label_en: 'Manning',
      label_ar: 'العمالة',
      lines: [
        { code: 'landscape_supervisor', label_en: 'Landscape Supervisor', label_ar: 'مشرف مزروعات',  default_qty: 1 },
        { code: 'gardener',             label_en: 'Gardener',             label_ar: 'جناين',           default_qty: 12 },
        { code: 'gardener_helper',      label_en: 'Gardener Helper',      label_ar: 'مساعد جناين',    default_qty: 6 },
        { code: 'irrigation_tech',      label_en: 'Irrigation Tech',      label_ar: 'فني ري',          default_qty: 2 },
      ],
    },
    {
      code: 'tools',
      label_en: 'Tools & Equipment',
      label_ar: 'الأدوات والمعدات',
      lines: [
        { code: 'tool_lawn_mower', label_en: 'Lawn Mower',       label_ar: 'جزازة عشب', default_unit_cost: 8500 },
        { code: 'tool_clippers',   label_en: 'Hedge Clippers',   label_ar: 'مقص شجر',   default_unit_cost: 220 },
        { code: 'tool_water_hose', label_en: 'Water Hose (50m)', label_ar: 'خرطوم',      default_unit_cost: 850 },
      ],
    },
    {
      code: 'consumables',
      label_en: 'Consumables',
      label_ar: 'المستهلكات',
      lines: [
        { code: 'cons_fertilizer', label_en: 'Fertilizer (kg)',    label_ar: 'سماد',    default_unit_cost: 35 },
        { code: 'cons_seeds',      label_en: 'Grass Seeds (kg)',   label_ar: 'بذور',    default_unit_cost: 95 },
        { code: 'cons_plants',     label_en: 'Replacement Plants', label_ar: 'نباتات',  default_unit_cost: 180 },
      ],
    },
    {
      code: 'transport',
      label_en: 'Transportation & Vehicles',
      label_ar: 'النقل والمركبات',
      lines: [
        { code: 'veh_pickup', label_en: 'Pickup', label_ar: 'بيك أب', default_unit_cost: 18200 },
        { code: 'fuel',       label_en: 'Fuel',   label_ar: 'وقود',    default_unit_cost: 7000 },
      ],
    },
    {
      code: 'it',
      label_en: 'IT & Communication',
      label_ar: 'تقنية المعلومات والاتصال',
      lines: [
        { code: 'it_per_head', label_en: 'Mobile / SIM (per head)', label_ar: 'موبايل وشريحة', default_unit_cost: 120 },
      ],
    },
    // governmental category injected post-merge in templates/index.ts (Task 11)
  ],
  // Odoo COA: service prefix '53' = Landscape.
  account_map_json: [
    { category: 'manning',      code_patterns: ['^5300[0-9]{2}$'] },
    { category: 'consumables',  code_patterns: ['^5301[0-9]{2}$'] },
    { category: 'tools',        code_patterns: ['^5302[0-9]{2}$'] },
    { category: 'it',           code_patterns: ['^5303[0-9]{2}$'] },
    { category: 'transport',    code_patterns: ['^5305[0-9]{2}$'] },
  ],
};
