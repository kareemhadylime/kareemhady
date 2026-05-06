import type { Template } from '../schema';

export const hkTemplate: Template = {
  service_line: 'hk',
  version: 1,
  vat_pct: 14,
  default_seasons: { high: [9,10,11,12,1,2,3,4], low: [5,6,7,8] },
  categories: [
    {
      code: 'manning',
      label_en: 'Manning',
      label_ar: 'العمالة',
      lines: [
        { code: 'hk_manager',    label_en: 'HK Manager',          label_ar: 'مدير النظافة',  default_qty: 1 },
        { code: 'asst_manager',  label_en: 'Assistant Manager',   label_ar: 'مدير مساعد',     default_qty: 1 },
        { code: 'sr_supervisor', label_en: 'Senior Supervisor',   label_ar: 'مشرف أول',       default_qty: 2 },
        { code: 'sup_8h',        label_en: 'Supervisor 8H',       label_ar: 'مشرف 8 ساعات',   default_qty: 4 },
        { code: 'hk_mf_8h',      label_en: 'HK Male & Female 8H', label_ar: 'عامل/ة نظافة',   default_qty: 60 },
        { code: 'facades_sup',   label_en: 'Facades Supervisor',  label_ar: 'مشرف واجهات',    default_qty: 1 },
        { code: 'facades_lab',   label_en: 'Facades Labor',       label_ar: 'عامل واجهات',    default_qty: 8 },
        { code: 'waste_sup',     label_en: 'Waste Supervisor',    label_ar: 'مشرف نفايات',    default_qty: 1 },
        { code: 'waste_lab',     label_en: 'Waste Labor',         label_ar: 'عامل نفايات',    default_qty: 6 },
        { code: 'admin',         label_en: 'Admin',               label_ar: 'إداري',           default_qty: 1 },
        { code: 'storekeeper',   label_en: 'Storekeeper',         label_ar: 'أمين مخزن',       default_qty: 1 },
        { code: 'driver',        label_en: 'Driver',              label_ar: 'سائق',            default_qty: 2 },
        { code: 'trainer',       label_en: 'Trainer',             label_ar: 'مدرب',            default_qty: 1 },
        { code: 'sup_8h_r',      label_en: 'Supervisor 8H (R)',   label_ar: 'مشرف بديل',       default_qty: 1 },
        { code: 'hk_f_8h_r',     label_en: 'HK Female 8H (R)',    label_ar: 'بديلة',           default_qty: 4 },
      ],
    },
    {
      code: 'ppe',
      label_en: 'Uniform & PPE',
      label_ar: 'الزي والمعدات الواقية',
      lines: [
        { code: 'uniform_polo',  label_en: 'Polo Uniform',  label_ar: 'بولو',     default_unit_cost: 240 },
        { code: 'uniform_pants', label_en: 'Pants',          label_ar: 'بنطال',     default_unit_cost: 180 },
        { code: 'safety_shoes',  label_en: 'Safety Shoes',   label_ar: 'حذاء أمان', default_unit_cost: 320 },
        { code: 'gloves_pack',   label_en: 'Gloves (pack)',  label_ar: 'قفازات',    default_unit_cost: 65 },
      ],
    },
    {
      code: 'tools',
      label_en: 'Tools, Machinery & Consumables',
      label_ar: 'الأدوات والآلات والمستهلكات',
      lines: [
        { code: 'machinery_scrubber',  label_en: 'Auto Scrubber',  label_ar: 'مكنسة آلية', default_unit_cost: 18000 },
        { code: 'tool_broom_soft',     label_en: 'Soft Broom',     label_ar: 'مكنسة ناعمة', default_unit_cost: 85 },
        { code: 'cons_floor_clean_5l', label_en: 'Floor Cleaner 5L', label_ar: 'منظف أرضيات', default_unit_cost: 42 },
      ],
    },
    {
      code: 'transport',
      label_en: 'Transportation & Vehicles',
      label_ar: 'النقل والمركبات',
      lines: [
        { code: 'veh_microbus', label_en: 'Microbus 14-seater', label_ar: 'ميكروباص', default_unit_cost: 28400 },
        { code: 'veh_pickup',   label_en: 'Pickup',             label_ar: 'بيك أب',     default_unit_cost: 18200 },
        { code: 'fuel',         label_en: 'Fuel',               label_ar: 'وقود',        default_unit_cost: 12500 },
      ],
    },
    {
      code: 'it',
      label_en: 'IT & Communication',
      label_ar: 'تقنية المعلومات والاتصال',
      lines: [
        { code: 'it_per_head', label_en: 'Laptop / Mobile / SIM (per head)', label_ar: 'لابتوب / موبايل / شريحة', default_unit_cost: 250 },
      ],
    },
    // governmental category injected post-merge in templates/index.ts (Task 11)
  ],
  account_map_json: [
    { category: 'manning',      code_patterns: ['^5000(0[1-9]|1[0-4])$'] },
    { category: 'ppe',          code_patterns: ['^500011$'] },
    { category: 'tools',        code_patterns: ['^5002(0[1-9]|1[0-9])$', '^5001(0[1-9]|1[0-9])$'] },
    { category: 'consumables',  code_patterns: ['^5001(0[1-9]|1[0-9])$'] },
    { category: 'transport',    code_patterns: ['^5005[0-9]{2}$'] },
    { category: 'it',           code_patterns: ['^5003(0[1-9]|1[0-9])$'] },
    { category: 'governmental', code_patterns: ['^5006[0-9]{2}$'] },
  ],
};
