import type { Template } from '../schema';

export const wasteMgmtTemplate: Template = {
  service_line: 'waste_mgmt',
  version: 1,
  vat_pct: 14,
  default_seasons: { high: [9,10,11,12,1,2,3,4], low: [5,6,7,8] },
  categories: [
    {
      code: 'manning',
      label_en: 'Manning',
      label_ar: 'العمالة',
      lines: [
        { code: 'waste_supervisor', label_en: 'Waste Supervisor', label_ar: 'مشرف نفايات', default_qty: 1 },
        { code: 'waste_collector',  label_en: 'Waste Collector',  label_ar: 'عامل جمع',    default_qty: 8 },
        { code: 'waste_driver',     label_en: 'Waste Driver',     label_ar: 'سائق',         default_qty: 2 },
      ],
    },
    {
      code: 'transport',
      label_en: 'Transportation & Equipment',
      label_ar: 'النقل والمعدات',
      lines: [
        { code: 'veh_compactor',    label_en: 'Waste Compactor Truck', label_ar: 'كباس',    default_unit_cost: 65000 },
        { code: 'veh_pickup_waste', label_en: 'Waste Pickup',          label_ar: 'بيك أب',  default_unit_cost: 18200 },
        { code: 'fuel',             label_en: 'Fuel',                  label_ar: 'وقود',     default_unit_cost: 14000 },
      ],
    },
    {
      code: 'tools',
      label_en: 'Tools & Equipment',
      label_ar: 'الأدوات والمعدات',
      lines: [
        { code: 'tool_bin_240l',        label_en: 'Bin 240L',                label_ar: 'حاوية',        default_unit_cost: 1450 },
        { code: 'tool_bin_1100l',       label_en: 'Bin 1100L',               label_ar: 'حاوية كبيرة',  default_unit_cost: 4800 },
        { code: 'tool_compactor_blade', label_en: 'Compactor Spare Blades',  label_ar: 'شفرات',        default_unit_cost: 320 },
      ],
    },
    {
      code: 'consumables',
      label_en: 'Consumables',
      label_ar: 'المستهلكات',
      lines: [
        { code: 'cons_garbage_bag_120l',  label_en: 'Garbage Bag 120L (pack)', label_ar: 'كيس قمامة',   default_unit_cost: 85 },
        { code: 'cons_disinfectant_spray', label_en: 'Disinfectant Spray',     label_ar: 'رذاذ معقم',   default_unit_cost: 140 },
      ],
    },
    // governmental category injected post-merge in templates/index.ts (Task 11)
  ],
  account_map_json: [
    { category: 'manning',      code_patterns: ['^5050[0-9]{2}$'] },
    { category: 'transport',    code_patterns: ['^5052[0-9]{2}$'] },
    { category: 'tools',        code_patterns: ['^5051[0-9]{2}$'] },
    { category: 'consumables',  code_patterns: ['^5051[0-9]{2}$'] },
    { category: 'governmental', code_patterns: ['^5006[0-9]{2}$'] },
  ],
};
