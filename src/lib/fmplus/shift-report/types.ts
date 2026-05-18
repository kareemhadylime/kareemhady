// Shared types + canonical vertical/role structure for FMPLUS Shift Reports.
//
// Verticals (service lines) and their internal roles are *fixed* — per-project
// configuration only toggles which verticals are active, which shifts they
// cover (morning/night), and the contractual planned headcount per role/shift.

export type VerticalKey = 'security' | 'cleaning' | 'pest_control' | 'landscape';
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
  { key: 'security',     nameAr: 'الأمن',          icon: '🛡️',
    roles: [
      { key: 'manager',    labelAr: 'مدير الامن' },
      { key: 'supervisor', labelAr: 'مشرف أمن' },
      { key: 'personnel',  labelAr: 'فرد أمن' },
      { key: 'emergency',  labelAr: 'طوارئ' },
      { key: 'motorcycle', labelAr: 'موتوسيكل' },
      { key: 'wireless',   labelAr: 'اجهزة لاسلكية' },
      { key: 'jeep',       labelAr: 'سيارة الجيب' },
    ]},
  { key: 'cleaning',     nameAr: 'النظافة',         icon: '🧹',
    roles: [
      { key: 'general_supervisor',  labelAr: 'مشرف عام' },
      { key: 'cleaning_supervisor', labelAr: 'مشرف نظافة' },
      { key: 'cleaning_personnel',  labelAr: 'فرد نظافة' },
    ]},
  { key: 'pest_control', nameAr: 'بيست كنترول',     icon: '🐛',
    roles: [
      { key: 'supervisor', labelAr: 'مشرف' },
      { key: 'technician', labelAr: 'فنى' },
    ]},
  { key: 'landscape',    nameAr: 'لاندسكيب',        icon: '🌿',
    roles: [
      { key: 'supervisor', labelAr: 'مشرف' },
      { key: 'workers',    labelAr: 'عمال' },
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
