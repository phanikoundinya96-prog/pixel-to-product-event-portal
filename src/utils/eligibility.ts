import { EligibilityStatus, AcademicAttendanceRecord, InstitutionSettings } from '@/types';

export interface EligibilityResult {
  status: EligibilityStatus | 'unavailable';
  percentage: number | null;
  percentageDisplay: string;
  threshold: number;
  isEligible: boolean;
  isStale: boolean;
  sourceDate: string | null;
  daysOld: number | null;
  message: string;
}

/**
 * Computes institutional event participation eligibility based on the latest accepted
 * academic attendance snapshot, configured threshold, and freshness rules.
 */
export function evaluateEligibility(
  record: AcademicAttendanceRecord | null | undefined,
  settings?: Partial<InstitutionSettings> | null
): EligibilityResult {
  const threshold = settings?.min_attendance_threshold ?? 75.0;
  const freshnessDays = settings?.attendance_freshness_days ?? 30;

  if (!record) {
    return {
      status: 'missing_data',
      percentage: null,
      percentageDisplay: 'Unavailable',
      threshold,
      isEligible: false,
      isStale: false,
      sourceDate: null,
      daysOld: null,
      message: 'No academic attendance record found in accepted department imports.',
    };
  }

  if (record.classes_conducted === 0) {
    return {
      status: 'unavailable',
      percentage: null,
      percentageDisplay: 'Unavailable (0 conducted)',
      threshold,
      isEligible: false,
      isStale: false,
      sourceDate: record.source_date,
      daysOld: 0,
      message: 'Zero classes conducted for this reporting cycle. Attendance cannot be determined.',
    };
  }

  // Calculate age of data
  const recordDate = new Date(record.source_date);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - recordDate.getTime());
  const daysOld = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const isStale = daysOld > freshnessDays;

  const pct = record.attendance_percentage ?? 
    (record.classes_conducted > 0 
      ? Math.round((record.classes_attended / record.classes_conducted) * 10000) / 100 
      : null);

  if (pct === null) {
    return {
      status: 'unavailable',
      percentage: null,
      percentageDisplay: 'Unavailable',
      threshold,
      isEligible: false,
      isStale: false,
      sourceDate: record.source_date,
      daysOld,
      message: 'Attendance percentage is unavailable.',
    };
  }

  if (isStale) {
    return {
      status: 'stale_data',
      percentage: pct,
      percentageDisplay: `${pct.toFixed(1)}%`,
      threshold,
      isEligible: false,
      isStale: true,
      sourceDate: record.source_date,
      daysOld,
      message: `Attendance snapshot is ${daysOld} days old (exceeds ${freshnessDays}-day institutional freshness limit). Fresh import required.`,
    };
  }

  if (pct >= threshold) {
    return {
      status: 'eligible',
      percentage: pct,
      percentageDisplay: `${pct.toFixed(1)}%`,
      threshold,
      isEligible: true,
      isStale: false,
      sourceDate: record.source_date,
      daysOld,
      message: `Meets institutional minimum criterion of ${threshold}% (Current: ${pct.toFixed(1)}%).`,
    };
  }

  return {
    status: 'ineligible',
    percentage: pct,
    percentageDisplay: `${pct.toFixed(1)}%`,
    threshold,
    isEligible: false,
    isStale: false,
    sourceDate: record.source_date,
    daysOld,
    message: `Below minimum institutional criterion of ${threshold}% (Current: ${pct.toFixed(1)}%). Attendance improvement required.`,
  };
}
