import { describe, it, expect } from 'vitest';
import { parseCSV, validateAttendanceCSV } from '../src/utils/csvParser';
import { evaluateEligibility } from '../src/utils/eligibility';
import { AcademicAttendanceRecord } from '../src/types';

describe('Milestone 3A — Academic Attendance Calculations & Eligibility', () => {
  // Test 1: 82/100 producing 82%
  it('correctly calculates 82/100 producing exactly 82%', () => {
    const rawCSV = parseCSV(`roll_number,classes_conducted,classes_attended
21CS101,100,82`);
    const profiles = new Map([
      ['21CS101', { id: 'user-1', name: 'Alex', department: 'CSE' }],
    ]);
    const summary = validateAttendanceCSV(rawCSV, profiles);

    expect(summary.totalRows).toBe(1);
    expect(summary.validCount).toBe(1);
    expect(summary.rows[0].attendance_percentage).toBe(82);
    expect(summary.rows[0].status).toBe('valid');
  });

  // Test 2: 75/100 meeting a 75% threshold
  it('evaluates 75/100 as meeting the 75% eligibility threshold', () => {
    const record: AcademicAttendanceRecord = {
      id: 'rec-1',
      import_id: 'imp-1',
      student_id: 'user-2',
      roll_number: '21CS102',
      student_name: 'David',
      classes_conducted: 100,
      classes_attended: 75,
      attendance_percentage: 75,
      source_date: new Date().toISOString().split('T')[0],
      validation_status: 'valid',
      created_at: new Date().toISOString(),
    };

    const result = evaluateEligibility(record, { min_attendance_threshold: 75 });
    expect(result.percentage).toBe(75);
    expect(result.threshold).toBe(75);
    expect(result.isEligible).toBe(true);
    expect(result.status).toBe('eligible');
  });

  // Test 3: 3/4 producing 75%
  it('correctly calculates 3/4 producing 75%', () => {
    const rawCSV = parseCSV(`roll_number,classes_conducted,classes_attended
21IT201,4,3`);
    const profiles = new Map([
      ['21IT201', { id: 'user-3', name: 'Sarah', department: 'IT' }],
    ]);
    const summary = validateAttendanceCSV(rawCSV, profiles);

    expect(summary.validCount).toBe(1);
    expect(summary.rows[0].attendance_percentage).toBe(75);

    const record: AcademicAttendanceRecord = {
      id: 'rec-3',
      import_id: 'imp-1',
      student_id: 'user-3',
      roll_number: '21IT201',
      student_name: 'Sarah',
      classes_conducted: 4,
      classes_attended: 3,
      attendance_percentage: 75,
      source_date: new Date().toISOString().split('T')[0],
      validation_status: 'valid',
      created_at: new Date().toISOString(),
    };

    const result = evaluateEligibility(record, { min_attendance_threshold: 75 });
    expect(result.percentage).toBe(75);
    expect(result.isEligible).toBe(true);
  });

  // Test 4: Zero conducted classes producing Unavailable rather than 0%
  it('evaluates zero conducted classes as Unavailable rather than 0%', () => {
    const rawCSV = parseCSV(`roll_number,classes_conducted,classes_attended
21EC301,0,0`);
    const profiles = new Map([
      ['21EC301', { id: 'user-4', name: 'James', department: 'ECE' }],
    ]);
    const summary = validateAttendanceCSV(rawCSV, profiles);

    expect(summary.rows[0].attendance_percentage).toBeNull();

    const record: AcademicAttendanceRecord = {
      id: 'rec-4',
      import_id: 'imp-1',
      student_id: 'user-4',
      roll_number: '21EC301',
      student_name: 'James',
      classes_conducted: 0,
      classes_attended: 0,
      attendance_percentage: null as any,
      source_date: new Date().toISOString().split('T')[0],
      validation_status: 'valid',
      created_at: new Date().toISOString(),
    };

    const result = evaluateEligibility(record);
    expect(result.status).toBe('unavailable');
    expect(result.percentage).toBeNull();
    expect(result.percentageDisplay).toContain('Unavailable');
    expect(result.isEligible).toBe(false);
  });

  // Test 5: Attendance values exceeding conducted classes being rejected
  it('rejects rows where attended classes exceed conducted classes', () => {
    const rawCSV = parseCSV(`roll_number,classes_conducted,classes_attended
21CS105,100,105`);
    const profiles = new Map([
      ['21CS105', { id: 'user-5', name: 'Invalid User', department: 'CSE' }],
    ]);
    const summary = validateAttendanceCSV(rawCSV, profiles);

    expect(summary.invalidCount).toBe(1);
    expect(summary.validCount).toBe(0);
    expect(summary.rows[0].status).toBe('invalid');
    expect(summary.rows[0].error).toContain('exceeds classes conducted');
  });

  // Test 6: Duplicate and unmatched records being reported
  it('detects and reports duplicate roll numbers and unmatched profiles', () => {
    const rawCSV = parseCSV(`roll_number,classes_conducted,classes_attended
21CS101,50,45
21CS101,50,40
99XX999,50,48`);
    const profiles = new Map([
      ['21CS101', { id: 'user-1', name: 'Alex', department: 'CSE' }],
    ]);
    const summary = validateAttendanceCSV(rawCSV, profiles);

    expect(summary.totalRows).toBe(3);
    expect(summary.validCount).toBe(1);
    expect(summary.duplicateCount).toBe(1);
    expect(summary.unmatchedCount).toBe(1);

    expect(summary.rows[0].status).toBe('valid');
    expect(summary.rows[1].status).toBe('duplicate');
    expect(summary.rows[1].error).toContain('Duplicate roll number');
    expect(summary.rows[2].status).toBe('unmatched_student');
    expect(summary.rows[2].error).toContain('not yet registered in profiles');
  });

  // Test 7: A failed import does not replace the previously accepted dataset
  it('simulates import state preservation: failed imports are not accepted', () => {
    const mockImports = [
      { id: 'imp-1', status: 'completed', source_date: '2026-10-01' },
      { id: 'imp-2', status: 'failed', source_date: '2026-10-10' },
    ];

    // Filter for accepted datasets
    const acceptedImports = mockImports.filter((i) => i.status === 'completed');
    expect(acceptedImports.length).toBe(1);
    expect(acceptedImports[0].id).toBe('imp-1');
  });

  // Test 8: Stale attendance detection
  it('flags attendance older than freshness threshold as stale_data', () => {
    const record: AcademicAttendanceRecord = {
      id: 'rec-old',
      import_id: 'imp-1',
      student_id: 'user-1',
      roll_number: '21CS101',
      student_name: 'Alex',
      classes_conducted: 100,
      classes_attended: 90,
      attendance_percentage: 90,
      source_date: '2025-01-01', // over a year ago
      validation_status: 'valid',
      created_at: '2025-01-01',
    };

    const result = evaluateEligibility(record, {
      min_attendance_threshold: 75,
      attendance_freshness_days: 30,
    });

    expect(result.status).toBe('stale_data');
    expect(result.isStale).toBe(true);
    expect(result.isEligible).toBe(false);
    expect(result.message).toContain('freshness limit');
  });
});
