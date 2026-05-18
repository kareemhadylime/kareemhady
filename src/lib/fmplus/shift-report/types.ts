// Shared types + canonical vertical/role structure for FMPLUS Shift Reports.
//
// Verticals (service lines) and their internal roles are *fixed* in this master
// catalog. Per-project configuration controls which verticals are added (key
// presence in `config.verticals`) and which roles within them are added (key
// presence in `vc.roles`), plus the per-shift contractual headcount per role.
//
// Personnel and equipment are split into separate verticals so daily shift
// reports cleanly distinguish "how many people on duty" from "how many vehicles
// / devices deployed". Role labels and master role lists were derived from FM+
// project budgets (City Gate, Tanta Mall, D5, AUC, AEON, Trio).

export type VerticalKey =
  | 'security'
  | 'security_equipment'
  | 'cleaning'
  | 'cleaning_equipment'
  | 'pest_control'
  | 'landscape'
  | 'mep'
  | 'mep_equipment'
  | 'backoffice';
export type ShiftKey    = 'morning' | 'night';
export type SectionKey  = 'today_morning' | 'yesterday_morning' | 'yesterday_night';

export interface RoleDef {
  key:     string;
  labelAr: string;
}

export interface VerticalDef {
  key:     VerticalKey;
  nameAr:  string;
  icon:    string;
  roles:   readonly RoleDef[];
}

export const SR_VERTICALS: readonly VerticalDef[] = [
  // ─── Security ────────────────────────────────────────────────────────────
  { key: 'security', nameAr: 'الأمن - أفراد', icon: '🛡️',
    roles: [
      { key: 'manager',           labelAr: 'مدير الأمن' },
      { key: 'safety_supervisor', labelAr: 'مشرف السلامة' },
      { key: 'supervisor',        labelAr: 'مشرف أمن' },
      { key: 'personnel',         labelAr: 'فرد أمن' },
      { key: 'emergency',         labelAr: 'طوارئ' },
      { key: 'cctv_operator',     labelAr: 'مشغل كاميرات المراقبة' },
    ]},
  { key: 'security_equipment', nameAr: 'الأمن - معدات', icon: '🚓',
    roles: [
      { key: 'motorcycle', labelAr: 'موتوسيكل' },
      { key: 'jeep',       labelAr: 'سيارة الجيب' },
      { key: 'pickup',     labelAr: 'بيك أب' },
      { key: 'golf_car',   labelAr: 'سيارة جولف' },
      { key: 'wireless',   labelAr: 'أجهزة لاسلكية' },
    ]},

  // ─── Cleaning / Housekeeping ─────────────────────────────────────────────
  { key: 'cleaning', nameAr: 'النظافة - أفراد', icon: '🧹',
    roles: [
      { key: 'manager',             labelAr: 'مدير النظافة' },
      { key: 'assistant_manager',   labelAr: 'مساعد مدير النظافة' },
      { key: 'senior_supervisor',   labelAr: 'مشرف أول' },
      { key: 'general_supervisor',  labelAr: 'مشرف عام' },
      { key: 'cleaning_supervisor', labelAr: 'مشرف نظافة' },
      { key: 'cleaning_personnel',  labelAr: 'فرد نظافة' },
      { key: 'facades_supervisor',  labelAr: 'مشرف واجهات' },
      { key: 'facades_labor',       labelAr: 'عامل واجهات' },
      { key: 'waste_supervisor',    labelAr: 'مشرف نفايات' },
      { key: 'waste_labor',         labelAr: 'عامل نفايات' },
      { key: 'trainer',             labelAr: 'مدرب' },
    ]},
  { key: 'cleaning_equipment', nameAr: 'النظافة - معدات', icon: '🚛',
    roles: [
      { key: 'road_sweeper',     labelAr: 'مكنسة طرق' },
      { key: 'waste_truck',      labelAr: 'سيارة نفايات' },
      { key: 'pressure_washer',  labelAr: 'ماكينة ضغط مياه' },
      { key: 'scrubber',         labelAr: 'ماكينة جلي' },
    ]},

  // ─── Pest Control ────────────────────────────────────────────────────────
  { key: 'pest_control', nameAr: 'بيست كنترول', icon: '🐛',
    roles: [
      { key: 'supervisor', labelAr: 'مشرف بيست كنترول' },
      { key: 'technician', labelAr: 'فنى بيست كنترول' },
    ]},

  // ─── Landscape ───────────────────────────────────────────────────────────
  { key: 'landscape', nameAr: 'لاندسكيب', icon: '🌿',
    roles: [
      { key: 'manager',    labelAr: 'مدير لاندسكيب' },
      { key: 'supervisor', labelAr: 'مشرف لاندسكيب' },
      { key: 'workers',    labelAr: 'عمال لاندسكيب' },
    ]},

  // ─── MEP / Maintenance ───────────────────────────────────────────────────
  { key: 'mep', nameAr: 'الصيانة - أفراد', icon: '🔧',
    roles: [
      { key: 'fm_manager',                 labelAr: 'مدير المنشأة' },
      { key: 'site_manager',               labelAr: 'مدير الموقع' },
      { key: 'senior_engineer',            labelAr: 'مهندس MEP أول' },
      { key: 'maintenance_engineer',       labelAr: 'مهندس صيانة' },
      { key: 'general_supervisor',         labelAr: 'مشرف عام' },
      { key: 'electrical_supervisor',      labelAr: 'مشرف كهرباء' },
      { key: 'mechanical_supervisor',      labelAr: 'مشرف ميكانيكا' },
      { key: 'light_current_supervisor',   labelAr: 'مشرف تيار خفيف' },
      { key: 'mechanical_team_leader',     labelAr: 'رئيس فريق ميكانيكا' },
      { key: 'electrical_team_leader',     labelAr: 'رئيس فريق كهرباء' },
      { key: 'light_current_team_leader',  labelAr: 'رئيس فريق تيار خفيف' },
      { key: 'civil_team_leader',          labelAr: 'رئيس فريق مدنى' },
      { key: 'electrician',                labelAr: 'فنى كهرباء' },
      { key: 'plumber',                    labelAr: 'فنى سباكة' },
      { key: 'hvac_technician',            labelAr: 'فنى تكييف' },
      { key: 'mechanical_technician',      labelAr: 'فنى ميكانيكا' },
      { key: 'light_current_technician',   labelAr: 'فنى تيار خفيف' },
      { key: 'bms_operator',               labelAr: 'مشغل BMS' },
      { key: 'civil_worker',               labelAr: 'عامل مدنى' },
      { key: 'painter',                    labelAr: 'دهان' },
      { key: 'carpenter',                  labelAr: 'نجار' },
      { key: 'helper',                     labelAr: 'مساعد' },
      { key: 'cafm_coordinator',           labelAr: 'منسق CAFM' },
      { key: 'help_desk',                  labelAr: 'مكتب خدمة العملاء' },
    ]},
  { key: 'mep_equipment', nameAr: 'الصيانة - معدات', icon: '🛠️',
    roles: [
      { key: 'manlift',     labelAr: 'رافع متحرك' },
      { key: 'scissor_lift', labelAr: 'سلم متحرك (مقص)' },
      { key: 'tools_van',   labelAr: 'عربة عدد' },
    ]},

  // ─── Back-office / Admin (cross-cutting) ─────────────────────────────────
  { key: 'backoffice', nameAr: 'الإدارة المكتبية', icon: '📋',
    roles: [
      { key: 'admin',       labelAr: 'إدارى' },
      { key: 'storekeeper', labelAr: 'أمين مخزن' },
      { key: 'purchaser',   labelAr: 'مشتريات' },
      { key: 'controller',  labelAr: 'مراقب' },
      { key: 'driver',      labelAr: 'سائق' },
      { key: 'receptionist', labelAr: 'استقبال' },
    ]},
] as const;

export const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const;

export interface RolePlanned {
  morning?: number;
  night?: number;
}

export interface VerticalConfig {
  shifts: ShiftKey[];
  roles:  Record<string, RolePlanned>;
}

export interface ShiftReportConfig {
  contractNumber?: string;
  waGroup?:        string;
  verticals:       Partial<Record<VerticalKey, VerticalConfig>>;
}

export type ShiftSectionData = Partial<Record<VerticalKey, Record<string, number>>>;

export interface ShiftReportData {
  today_morning:     ShiftSectionData;
  yesterday_morning: ShiftSectionData;
  yesterday_night:   ShiftSectionData;
}

/** Default for a fresh, unconfigured project — no verticals added yet. */
export function defaultVerticalConfig(): Partial<Record<VerticalKey, VerticalConfig>> {
  return {};
}

/** Factory for a newly-added vertical (used by the Settings tab add-vertical handler). */
export function newVerticalConfig(): VerticalConfig {
  return { shifts: [], roles: {} };
}

export function defaultReportData(): ShiftReportData {
  const emptySection = (): ShiftSectionData => {
    const out: ShiftSectionData = {};
    SR_VERTICALS.forEach((v) => {
      const roleCounts: Record<string, number> = {};
      v.roles.forEach((r) => { roleCounts[r.key] = 0; });
      out[v.key] = roleCounts;
    });
    return out;
  };
  return {
    today_morning:     emptySection(),
    yesterday_morning: emptySection(),
    yesterday_night:   emptySection(),
  };
}

export function formatDate(d: Date): string {
  return `${d.getDate()}-${d.getMonth() + 1}-${d.getFullYear()}`;
}
