import type { Template } from '../schema';

export const mepTemplate: Template = {
  service_line: 'mep',
  version: 1,
  vat_pct: 14,
  default_seasons: { high: [9,10,11,12,1,2,3,4], low: [5,6,7,8] },
  categories: [
    {
      code: 'manning',
      label_en: 'Manning',
      label_ar: 'العمالة الفنية',
      lines: [
        { code: 'mep_supervisor',          label_en: 'Supervisor',            label_ar: 'مشرف فني',        default_qty: 2 },
        { code: 'mep_engineer',            label_en: 'Engineer',              label_ar: 'مهندس',            default_qty: 1 },
        { code: 'mep_technician_hvac',     label_en: 'HVAC Technician',       label_ar: 'فني تكييف',        default_qty: 4 },
        { code: 'mep_technician_plumbing', label_en: 'Plumbing Technician',   label_ar: 'فني سباكة',        default_qty: 3 },
        { code: 'mep_technician_electric', label_en: 'Electrical Technician', label_ar: 'فني كهرباء',       default_qty: 3 },
        { code: 'mep_helper',              label_en: 'MEP Helper',            label_ar: 'مساعد فني',        default_qty: 6 },
      ],
    },
    {
      code: 'tools',
      label_en: 'Tools & Equipment',
      label_ar: 'الأدوات والمعدات',
      lines: [
        { code: 'tool_multimeter',  label_en: 'Multimeter',      label_ar: 'أفوميتر',       default_unit_cost: 800 },
        { code: 'tool_pipe_wrench', label_en: 'Pipe Wrench',     label_ar: 'مفتاح مواسير',  default_unit_cost: 350 },
        { code: 'tool_drill',       label_en: 'Cordless Drill',  label_ar: 'دريل',          default_unit_cost: 2500 },
      ],
    },
    {
      code: 'consumables',
      label_en: 'Consumables',
      label_ar: 'المستهلكات',
      lines: [
        { code: 'cons_filter_ahu',      label_en: 'AHU Filter',           label_ar: 'فلتر تكييف',  default_unit_cost: 180 },
        { code: 'cons_pvc_pipe',        label_en: 'PVC Pipe (m)',          label_ar: 'ماسورة',       default_unit_cost: 45 },
        { code: 'cons_electrical_wire', label_en: 'Electrical Wire (m)',   label_ar: 'سلك كهرباء',  default_unit_cost: 28 },
      ],
    },
    {
      code: 'transport',
      label_en: 'Transportation & Vehicles',
      label_ar: 'النقل والمركبات',
      lines: [
        { code: 'veh_pickup', label_en: 'Pickup', label_ar: 'بيك أب', default_unit_cost: 18200 },
        { code: 'fuel',       label_en: 'Fuel',   label_ar: 'وقود',    default_unit_cost: 8500 },
      ],
    },
    {
      code: 'it',
      label_en: 'IT & Communication',
      label_ar: 'تقنية المعلومات والاتصال',
      lines: [
        { code: 'it_per_head', label_en: 'Laptop / Mobile / SIM (per head)', label_ar: 'أجهزة لكل عامل', default_unit_cost: 250 },
      ],
    },
    // governmental category injected post-merge in templates/index.ts (Task 11)
  ],
  account_map_json: [
    { category: 'manning',      code_patterns: ['^5010[0-9]{2}$'] },
    { category: 'tools',        code_patterns: ['^5011[0-9]{2}$'] },
    { category: 'consumables',  code_patterns: ['^5011[0-9]{2}$'] },
    { category: 'transport',    code_patterns: ['^5012[0-9]{2}$'] },
    { category: 'it',           code_patterns: ['^5013[0-9]{2}$'] },
    { category: 'governmental', code_patterns: ['^5006[0-9]{2}$'] },
  ],
};
