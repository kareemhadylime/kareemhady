import type { Template } from '../schema';

export const securityTemplate: Template = {
  service_line: 'security',
  version: 1,
  vat_pct: 14,
  default_seasons: { high: [9,10,11,12,1,2,3,4], low: [5,6,7,8] },
  categories: [
    {
      code: 'manning',
      label_en: 'Manning',
      label_ar: 'العمالة الأمنية',
      lines: [
        { code: 'sec_manager',       label_en: 'Security Manager', label_ar: 'مدير الأمن',       default_qty: 1 },
        { code: 'sec_supervisor',    label_en: 'Supervisor',        label_ar: 'مشرف',              default_qty: 4 },
        { code: 'sec_guard_8h',      label_en: 'Guard 8H',          label_ar: 'حارس 8 ساعات',     default_qty: 24 },
        { code: 'sec_guard_12h',     label_en: 'Guard 12H',         label_ar: 'حارس 12 ساعة',     default_qty: 12 },
        { code: 'sec_dog_handler',   label_en: 'Dog Handler',       label_ar: 'مسؤول كلاب',       default_qty: 2 },
        { code: 'sec_cctv_operator', label_en: 'CCTV Operator',     label_ar: 'مسؤول كاميرات',    default_qty: 3 },
      ],
    },
    {
      code: 'ppe',
      label_en: 'Uniform & Equipment',
      label_ar: 'الزي والمعدات',
      lines: [
        { code: 'sec_uniform', label_en: 'Uniform Set',    label_ar: 'زي',              default_unit_cost: 480 },
        { code: 'sec_boots',   label_en: 'Tactical Boots', label_ar: 'حذاء تكتيكي',    default_unit_cost: 380 },
        { code: 'sec_belt',    label_en: 'Duty Belt',      label_ar: 'حزام',            default_unit_cost: 220 },
        { code: 'sec_badge',   label_en: 'ID Badge',       label_ar: 'شارة',            default_unit_cost: 50 },
      ],
    },
    {
      code: 'tools',
      label_en: 'Tools & Equipment',
      label_ar: 'الأدوات والمعدات',
      lines: [
        { code: 'tool_radio',          label_en: 'Two-Way Radio',    label_ar: 'لاسلكي',        default_unit_cost: 1800 },
        { code: 'tool_metal_detector', label_en: 'Metal Detector',   label_ar: 'كاشف معادن',   default_unit_cost: 950 },
        { code: 'tool_flashlight',     label_en: 'Flashlight',       label_ar: 'كشاف',          default_unit_cost: 280 },
      ],
    },
    {
      code: 'it',
      label_en: 'IT & Communication',
      label_ar: 'تقنية المعلومات والاتصال',
      lines: [
        { code: 'it_per_head', label_en: 'Mobile / SIM (per head)', label_ar: 'موبايل وشريحة', default_unit_cost: 150 },
      ],
    },
    // governmental category injected post-merge in templates/index.ts (Task 11)
  ],
  account_map_json: [
    { category: 'manning',      code_patterns: ['^5030[0-9]{2}$'] },
    { category: 'ppe',          code_patterns: ['^5031[0-9]{2}$'] },
    { category: 'tools',        code_patterns: ['^5031[0-9]{2}$'] },
    { category: 'it',           code_patterns: ['^5033[0-9]{2}$'] },
    { category: 'governmental', code_patterns: ['^5006[0-9]{2}$'] },
  ],
};
