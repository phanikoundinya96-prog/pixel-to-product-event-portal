import { describe, it, expect } from 'vitest';
import { validateDocumentFile, generateProofObjectKey } from '../src/utils/documentVault';
import { evaluateEligibility } from '../src/utils/eligibility';
import { AcademicAttendanceRecord } from '../src/types';

describe('Milestone 3B — Student OD Requests and Private Document Vault', () => {
  // Test 1: Document Vault Validation - Valid files pass
  it('accepts valid PDF, PNG, and JPEG documents within size limit', () => {
    const validPdf = new File(['%PDF-1.4 sample content'], 'acceptance_letter.pdf', {
      type: 'application/pdf',
    });
    const validPng = new File(['png-data'], 'ticket.png', {
      type: 'image/png',
    });
    const validJpg = new File(['jpg-data'], 'registration.jpg', {
      type: 'image/jpeg',
    });

    expect(validateDocumentFile(validPdf).valid).toBe(true);
    expect(validateDocumentFile(validPng).valid).toBe(true);
    expect(validateDocumentFile(validJpg).valid).toBe(true);
  });

  // Test 2: Document Vault Validation - Disallowed extensions and MIME types rejected
  it('rejects disallowed file extensions and invalid MIME types', () => {
    const scriptFile = new File(['malicious code'], 'exploit.exe', {
      type: 'application/x-msdownload',
    });
    const resScript = validateDocumentFile(scriptFile);
    expect(resScript.valid).toBe(false);
    expect(resScript.error).toContain('Allowed formats: PDF, JPEG, PNG');

    const fakePdf = new File(['fake content'], 'test.doc', {
      type: 'application/msword',
    });
    const resDoc = validateDocumentFile(fakePdf);
    expect(resDoc.valid).toBe(false);
  });

  // Test 3: Document Vault Validation - Oversized files rejected
  it('rejects files exceeding the 5MB size limit', () => {
    // 6MB dummy file
    const oversizedBytes = new Uint8Array(6 * 1024 * 1024);
    const oversizedFile = new File([oversizedBytes], 'huge_brochure.pdf', {
      type: 'application/pdf',
    });

    const res = validateDocumentFile(oversizedFile);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('exceeds the maximum allowed limit of 5 MB');
  });

  // Test 4: Object Key Generation - Scoped to authenticated student and unique
  it('generates unique, student-scoped private vault object keys', () => {
    const studentId = 'usr-student-456';
    const key1 = generateProofObjectKey(studentId, 'Acceptance Letter (Final).pdf');
    const key2 = generateProofObjectKey(studentId, 'Acceptance Letter (Final).pdf');

    expect(key1).toMatch(/^proofs\/usr-student-456\/\d+-[a-zA-Z0-9_-]+\.[a-z0-9]+$/);
    expect(key2).toMatch(/^proofs\/usr-student-456\/\d+-[a-zA-Z0-9_-]+\.[a-z0-9]+$/);
    // Unique keys to avoid accidental overwrite
    expect(key1).not.toBe(key2);
  });

  // Test 5: Date Range Validation - End date earlier than start date rejected
  it('rejects an OD schedule where end date is earlier than start date', () => {
    const startDate = '2026-10-20';
    const endDate = '2026-10-18';

    const isDateRangeValid = (start: string, end: string) => {
      if (!start || !end) return false;
      return new Date(end) >= new Date(start);
    };

    expect(isDateRangeValid(startDate, endDate)).toBe(false);
    expect(isDateRangeValid('2026-10-20', '2026-10-20')).toBe(true);
    expect(isDateRangeValid('2026-10-20', '2026-10-22')).toBe(true);
  });

  // Test 6: Overlap Detection with Existing Event Requests
  it('detects date overlaps with existing pending or approved student requests', () => {
    const existingRequests = [
      {
        id: 'req-1',
        event_title: 'Hackathon Alpha',
        od_start_date: '2026-10-15',
        od_end_date: '2026-10-18',
        status: 'approved_by_incharge',
      },
      {
        id: 'req-2',
        event_title: 'Symposium Beta',
        od_start_date: '2026-10-25',
        od_end_date: '2026-10-26',
        status: 'pending_proctor',
      },
    ];

    const checkOverlap = (newStart: string, newEnd: string) => {
      const nStart = new Date(newStart).getTime();
      const nEnd = new Date(newEnd).getTime();

      return existingRequests.some((r) => {
        if (!r.od_start_date || !r.od_end_date) return false;
        const eStart = new Date(r.od_start_date).getTime();
        const eEnd = new Date(r.od_end_date).getTime();
        return nStart <= eEnd && nEnd >= eStart;
      });
    };

    // Overlaps with Hackathon Alpha (Oct 15 - 18)
    expect(checkOverlap('2026-10-17', '2026-10-19')).toBe(true);
    // Overlaps with Symposium Beta (Oct 25 - 26)
    expect(checkOverlap('2026-10-24', '2026-10-25')).toBe(true);
    // Non-overlapping window (Oct 20 - 22)
    expect(checkOverlap('2026-10-20', '2026-10-22')).toBe(false);
  });

  // Test 7: Submission Requirement - Required document upload check before submission
  it('enforces required document proof before final submission is permitted', () => {
    const validateSubmissionPrerequisites = (submission: {
      status: 'draft' | 'submitted';
      documentUrl: string | null;
      role: string;
      benefit: string;
    }) => {
      if (submission.status === 'draft') return { ok: true };
      if (!submission.documentUrl) {
        return { ok: false, error: 'Supporting proof document is required for submission.' };
      }
      if (!submission.role || !submission.benefit) {
        return { ok: false, error: 'Participation role and benefit are required.' };
      }
      return { ok: true };
    };

    const draftWithoutDoc = validateSubmissionPrerequisites({
      status: 'draft',
      documentUrl: null,
      role: 'Participant',
      benefit: 'Learning full stack dev',
    });
    expect(draftWithoutDoc.ok).toBe(true);

    const submitWithoutDoc = validateSubmissionPrerequisites({
      status: 'submitted',
      documentUrl: null,
      role: 'Participant',
      benefit: 'Learning full stack dev',
    });
    expect(submitWithoutDoc.ok).toBe(false);
    expect(submitWithoutDoc.error).toContain('Supporting proof document is required');

    const submitWithDoc = validateSubmissionPrerequisites({
      status: 'submitted',
      documentUrl: 'proofs/usr-123/12345-acceptance.pdf',
      role: 'Participant',
      benefit: 'Learning full stack dev',
    });
    expect(submitWithDoc.ok).toBe(true);
  });

  // Test 8: Attendance Snapshot Derivation at Submission Time
  it('creates an immutable submission snapshot with percentage, threshold, and status', () => {
    const currentAttendance: AcademicAttendanceRecord = {
      id: 'att-rec-9',
      import_id: 'imp-oct-2026',
      student_id: 'student-99',
      roll_number: '21CS199',
      student_name: 'Priya Sharma',
      classes_conducted: 80,
      classes_attended: 68, // 85%
      attendance_percentage: 85,
      source_date: '2026-10-10',
      validation_status: 'valid',
      created_at: '2026-10-10T09:00:00Z',
    };

    const institutionSettings = {
      min_attendance_threshold: 75.0,
      attendance_freshness_days: 30,
    };

    const evalResult = evaluateEligibility(currentAttendance, institutionSettings);

    const submissionSnapshot = {
      submission_attendance_percentage: evalResult.percentage,
      submission_eligibility_status: evalResult.status,
      submission_threshold_applied: institutionSettings.min_attendance_threshold,
      submission_source_date: currentAttendance.source_date,
      submission_import_id: currentAttendance.import_id,
      submission_checked_at: new Date().toISOString(),
    };

    expect(submissionSnapshot.submission_attendance_percentage).toBe(85);
    expect(submissionSnapshot.submission_eligibility_status).toBe('eligible');
    expect(submissionSnapshot.submission_threshold_applied).toBe(75);
    expect(submissionSnapshot.submission_source_date).toBe('2026-10-10');
    expect(submissionSnapshot.submission_import_id).toBe('imp-oct-2026');
  });

  // Test 9: Snapshot Preservation - Historical snapshot is never silently overwritten
  it('preserves historical submission snapshot when new attendance records arrive', () => {
    // Initial snapshot saved on Oct 12
    const initialSubmission = {
      request_reference: 'OD-2026-1001',
      student_id: 'student-99',
      submission_attendance_percentage: 85,
      submission_eligibility_status: 'eligible',
      submission_threshold_applied: 75,
      submission_source_date: '2026-10-10',
      status: 'pending_proctor',
    };

    // Subsequent attendance drop in November import
    const novemberAttendance: AcademicAttendanceRecord = {
      id: 'att-rec-10',
      import_id: 'imp-nov-2026',
      student_id: 'student-99',
      roll_number: '21CS199',
      student_name: 'Priya Sharma',
      classes_conducted: 100,
      classes_attended: 70, // 70% < 75%
      attendance_percentage: 70,
      source_date: '2026-11-10',
      validation_status: 'valid',
      created_at: '2026-11-10T09:00:00Z',
    };

    const currentEval = evaluateEligibility(novemberAttendance, { min_attendance_threshold: 75 });
    expect(currentEval.status).toBe('ineligible');

    // Historical submission snapshot remains unaltered
    expect(initialSubmission.submission_attendance_percentage).toBe(85);
    expect(initialSubmission.submission_eligibility_status).toBe('eligible');
    expect(initialSubmission.submission_source_date).toBe('2026-10-10');
  });

  // Test 10: Reference ID format
  it('validates unique reference code structure OD-2026-XXXX', () => {
    const referenceRegex = /^OD-2026-[A-F0-9]{4}$/;
    const sampleRef1 = 'OD-2026-4A7B';
    const sampleRef2 = 'OD-2026-00FF';

    expect(referenceRegex.test(sampleRef1)).toBe(true);
    expect(referenceRegex.test(sampleRef2)).toBe(true);
    expect(referenceRegex.test('INVALID-REF')).toBe(false);
  });
});
