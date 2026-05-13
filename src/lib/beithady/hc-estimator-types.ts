// src/lib/beithady/hc-estimator-types.ts

export type BuildingKey = 'BH-26' | 'BH-73' | 'BH-435' | 'BH-OK';
export const BUILDINGS: BuildingKey[] = ['BH-26', 'BH-73', 'BH-435', 'BH-OK'];

export type UnitTypeCounts = {
  studio: number;
  oneBR: number;
  twoBR: number;
  threeBR: number;
  fourBR: number;
};

export type DayData = {
  date: string;           // "2026-04-03"
  building: BuildingKey;
  checkins: UnitTypeCounts;
  stayIns: number;        // occupied units not checking in or out today
  sameDayRollovers: number; // units with same-day checkout + checkin
};

export type HKBaseData = {
  month: string;                  // "April 2026"
  weeks: { week: 1 | 2 | 3 | 4; days: DayData[] }[];
  totalCheckins: UnitTypeCounts;  // portfolio total, all days
  totalRollovers: number;
  avgStayInsPerDay: number;
};

export type HKBuildingInput = {
  generalAreaHrsPerDay: number;
  nightShiftHKs: number;
};

export type HKInputs = {
  multiplier: number;
  buildings: Record<BuildingKey, HKBuildingInput>;
};

// --- Calculation output types ---

export type HKDayResult = {
  // reserved for future per-day drill-down view
  date: string;
  turnoverHrs: number;
  stayInHrs: number;
  areasHrs: number;
  totalHrs: number;
  dayHKsBaseline: number;
  rolloverPeakHKs: number;
  rolloverOverride: boolean;
  finalDayHKs: number;
  nightHKs: number;
  supervisors: number;
};

export type HKWeekResult = {
  week: 1 | 2 | 3 | 4;
  label: string;              // "W1 (Jun 1–7)"
  projectedCheckins: number;
  projectedRollovers: number;
  stayInHrs: number;
  areasHrs: number;
  totalHrs: number;
  dayHKs: number;             // peak day on-shift
  rolloverOverride: boolean;
  rolloverPeakHKs: number;    // peak rollover HKs for this week
  rolloverBaselineHKs: number; // peak-day baseline before rollover override
  nightHKs: number;           // fixed, sum of building inputs
  supervisors: number;        // on-shift
};

export type HKMonthResult = {
  weeks: HKWeekResult[];
  peakWeek: 1 | 2 | 3 | 4;
  // On-shift peaks
  dayHKsOnShift: number;
  nightHKsOnShift: number;
  supervisorsOnShift: number;
  // To-hire (×7/6 coverage factor)
  dayHKsToHire: number;
  nightHKsToHire: number;
  supervisorsToHire: number;
  grandTotalOnShift: number;
  grandTotalToHire: number;
};

// --- Security types ---

export type SecurityPost = {
  id: string;           // uuid — client-generated for React key
  name: string;
  dayShift: number;
  nightShift: number;
  allDay: number;       // 24hr posts — counts as ×2 bodies
};

export type SecurityBuildingConfig = {
  building: BuildingKey;
  posts: SecurityPost[];
};

export type SecurityResult = {
  buildings: {
    building: BuildingKey;
    dayOnShift: number;
    nightOnShift: number;
    allDayBodies: number;   // allDay × 2
    totalOnShift: number;
    dayToHire: number;
    nightToHire: number;
    allDayToHire: number;
    totalToHire: number;
  }[];
  portfolioDayOnShift: number;
  portfolioNightOnShift: number;
  portfolioAllDayBodies: number;
  portfolioTotalOnShift: number;
  portfolioDayToHire: number;
  portfolioNightToHire: number;
  portfolioAllDayToHire: number;
  portfolioTotalToHire: number;
};
