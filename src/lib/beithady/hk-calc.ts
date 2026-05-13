// src/lib/beithady/hk-calc.ts
import type {
  HKBaseData,
  HKInputs,
  HKWeekResult,
  HKMonthResult,
  DayData,
  BuildingKey,
  UnitTypeCounts,
  SecurityBuildingConfig,
  SecurityResult,
} from './hc-estimator-types';
import { BUILDINGS } from './hc-estimator-types';

export function coverageFactor(onShift: number): number {
  if (onShift === 0) return 0;
  return Math.ceil(onShift * 7 / 6);
}

function sumUnitCounts(counts: UnitTypeCounts, multiplier: number) {
  return {
    small: (counts.studio + counts.oneBR) * multiplier,
    large: (counts.twoBR + counts.threeBR + counts.fourBR) * multiplier,
  };
}

type PortfolioDayRow = {
  date: string;
  checkins: UnitTypeCounts;
  stayIns: number;
  sameDayRollovers: number;
};

function poolDays(days: DayData[]): PortfolioDayRow[] {
  const byDate = new Map<string, PortfolioDayRow>();
  for (const d of days) {
    const existing = byDate.get(d.date);
    if (!existing) {
      byDate.set(d.date, {
        date: d.date,
        checkins: { ...d.checkins },
        stayIns: d.stayIns,
        sameDayRollovers: d.sameDayRollovers,
      });
    } else {
      existing.checkins.studio     += d.checkins.studio;
      existing.checkins.oneBR      += d.checkins.oneBR;
      existing.checkins.twoBR      += d.checkins.twoBR;
      existing.checkins.threeBR    += d.checkins.threeBR;
      existing.checkins.fourBR     += d.checkins.fourBR;
      existing.stayIns             += d.stayIns;
      existing.sameDayRollovers    += d.sameDayRollovers;
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function totalAreasHrs(buildings: HKInputs['buildings']): number {
  return BUILDINGS.reduce((sum, b) => sum + (buildings[b]?.generalAreaHrsPerDay ?? 0), 0);
}

function totalNightHKs(buildings: HKInputs['buildings']): number {
  return BUILDINGS.reduce((sum, b) => sum + (buildings[b]?.nightShiftHKs ?? 0), 0);
}

function calcDayHKs(row: PortfolioDayRow, inputs: HKInputs, areasHrs: number): {
  finalDayHKs: number;
  rolloverOverride: boolean;
  rolloverPeakHKs: number;
  totalHrs: number;
  turnoverHrs: number;
  stayInHrs: number;
} {
  const m = inputs.multiplier;
  const { small, large } = sumUnitCounts(row.checkins, m);
  const turnoverHrs = small * 1 + large * 2;
  const stayInHrs = row.stayIns * m * 0.05 * 1;
  const totalHrs = turnoverHrs + stayInHrs + areasHrs;
  const baseline = Math.ceil(totalHrs / 8);

  // Rollover peak: assume all rollovers are small units (1 HK-hr each) — conservative
  const rolloverHKHrs = row.sameDayRollovers * m * 1;
  const rolloverPeakHKs = Math.ceil(rolloverHKHrs / 4);
  const finalDayHKs = Math.max(baseline, rolloverPeakHKs);

  return {
    finalDayHKs,
    rolloverOverride: rolloverPeakHKs > baseline,
    rolloverPeakHKs,
    totalHrs,
    turnoverHrs,
    stayInHrs,
  };
}

export function calculateHKWeeks(base: HKBaseData, inputs: HKInputs): HKMonthResult {
  const areasHrs = totalAreasHrs(inputs.buildings);
  const nightHKs = totalNightHKs(inputs.buildings);

  const weekResults: HKWeekResult[] = base.weeks.map(w => {
    const pooled = poolDays(w.days);

    const weekStarts = [1, 8, 15, 22];
    const weekEnds   = [7, 14, 21, 31];
    const start = weekStarts[w.week - 1];
    const end   = weekEnds[w.week - 1];
    const label = `W${w.week} (${start}–${end})`;

    if (pooled.length === 0) {
      const areasTotal = areasHrs * 7;
      const dayHKs = Math.ceil(areasTotal / 8);
      const totalHKs = dayHKs + nightHKs;
      return {
        week: w.week,
        label,
        projectedCheckins: 0,
        projectedRollovers: 0,
        stayInHrs: 0,
        areasHrs: areasTotal,
        totalHrs: areasTotal,
        dayHKs,
        rolloverOverride: false,
        rolloverPeakHKs: 0,
        nightHKs,
        supervisors: Math.ceil(totalHKs / 10),
      };
    }

    let peakDayHKs = 0;
    let peakRolloverOverride = false;
    let peakRolloverPeakHKs = 0;
    let weekTurnoverHrs = 0;
    let weekStayInHrs = 0;
    let weekTotalHrs = 0;
    let weekCheckins = 0;
    let weekRollovers = 0;

    for (const row of pooled) {
      const calc = calcDayHKs(row, inputs, areasHrs);
      weekCheckins  += (row.checkins.studio + row.checkins.oneBR + row.checkins.twoBR + row.checkins.threeBR + row.checkins.fourBR) * inputs.multiplier;
      weekRollovers += row.sameDayRollovers * inputs.multiplier;
      weekTurnoverHrs += calc.turnoverHrs;
      weekStayInHrs   += calc.stayInHrs;
      weekTotalHrs    += calc.totalHrs;

      if (calc.finalDayHKs > peakDayHKs) {
        peakDayHKs = calc.finalDayHKs;
        peakRolloverOverride = calc.rolloverOverride;
        peakRolloverPeakHKs = calc.rolloverPeakHKs;
      }
    }

    const totalHKsOnShift = peakDayHKs + nightHKs;
    const supervisors = Math.ceil(totalHKsOnShift / 10);

    return {
      week: w.week,
      label,
      projectedCheckins: Math.round(weekCheckins),
      projectedRollovers: Math.round(weekRollovers),
      stayInHrs: Math.round(weekStayInHrs * 10) / 10,
      areasHrs: areasHrs * (pooled.length),
      totalHrs: Math.round(weekTotalHrs * 10) / 10,
      dayHKs: peakDayHKs,
      rolloverOverride: peakRolloverOverride,
      rolloverPeakHKs: peakRolloverPeakHKs,
      nightHKs,
      supervisors,
    };
  });

  const peakWeekResult = weekResults.reduce(
    (max, w) => (w.dayHKs > max.dayHKs ? w : max),
    weekResults[0]
  );

  const dayHKsOnShift = peakWeekResult.dayHKs;
  const nightHKsOnShift = nightHKs;
  const supervisorsOnShift = Math.ceil((dayHKsOnShift + nightHKsOnShift) / 10);

  return {
    weeks: weekResults,
    peakWeek: peakWeekResult.week,
    dayHKsOnShift,
    nightHKsOnShift,
    supervisorsOnShift,
    dayHKsToHire: coverageFactor(dayHKsOnShift),
    nightHKsToHire: coverageFactor(nightHKsOnShift),
    supervisorsToHire: coverageFactor(supervisorsOnShift),
    grandTotalOnShift: dayHKsOnShift + nightHKsOnShift + supervisorsOnShift,
    grandTotalToHire: coverageFactor(dayHKsOnShift) + coverageFactor(nightHKsOnShift) + coverageFactor(supervisorsOnShift),
  };
}

// ─── Security calculation ──────────────────────────────────────────────────

export function calculateSecurity(configs: SecurityBuildingConfig[]): SecurityResult {
  const buildings = configs.map(c => {
    const dayOnShift   = c.posts.reduce((s, p) => s + p.dayShift + p.allDay, 0);
    const nightOnShift = c.posts.reduce((s, p) => s + p.nightShift + p.allDay, 0);
    const allDayBodies = c.posts.reduce((s, p) => s + p.allDay * 2, 0);
    const totalOnShift = dayOnShift + nightOnShift;
    return {
      building: c.building,
      dayOnShift,
      nightOnShift,
      allDayBodies,
      totalOnShift,
      dayToHire:    coverageFactor(dayOnShift),
      nightToHire:  coverageFactor(nightOnShift),
      allDayToHire: coverageFactor(c.posts.reduce((s, p) => s + p.allDay, 0)) * 2,
      totalToHire:  coverageFactor(dayOnShift) + coverageFactor(nightOnShift),
    };
  });

  return {
    buildings,
    portfolioDayOnShift:   buildings.reduce((s, b) => s + b.dayOnShift, 0),
    portfolioNightOnShift: buildings.reduce((s, b) => s + b.nightOnShift, 0),
    portfolioAllDayBodies: buildings.reduce((s, b) => s + b.allDayBodies, 0),
    portfolioTotalOnShift: buildings.reduce((s, b) => s + b.totalOnShift, 0),
    portfolioDayToHire:    buildings.reduce((s, b) => s + b.dayToHire, 0),
    portfolioNightToHire:  buildings.reduce((s, b) => s + b.nightToHire, 0),
    portfolioAllDayToHire: buildings.reduce((s, b) => s + b.allDayToHire, 0),
    portfolioTotalToHire:  buildings.reduce((s, b) => s + b.totalToHire, 0),
  };
}
