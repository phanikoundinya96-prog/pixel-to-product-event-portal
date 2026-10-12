export interface CSVRow {
  roll_number: string;
  student_name: string;
  department: string;
  classes_conducted: string;
  classes_attended: string;
  [key: string]: string;
}

export interface ParsedAttendanceRow {
  rowIndex: number;
  roll_number: string;
  student_name: string;
  department: string;
  classes_conducted: number;
  classes_attended: number;
  attendance_percentage: number | null;
  isValid: boolean;
  status: 'valid' | 'invalid' | 'duplicate' | 'unmatched_student';
  error: string | null;
  matchedStudentId: string | null;
}

export interface ImportValidationSummary {
  totalRows: number;
  validCount: number;
  invalidCount: number;
  duplicateCount: number;
  unmatchedCount: number;
  rows: ParsedAttendanceRow[];
}

/**
 * Pure TypeScript CSV parser handling quotes, delimiters, and CRLF line breaks.
 */
export function parseCSV(csvText: string): string[][] {
  const lines: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  const normalized = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    const nextChar = normalized[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentField += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentField.trim());
      currentField = '';
    } else if (char === '\n' && !insideQuotes) {
      currentRow.push(currentField.trim());
      if (currentRow.some((f) => f.length > 0)) {
        lines.push(currentRow);
      }
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      lines.push(currentRow);
    }
  }

  return lines;
}

/**
 * Validates attendance CSV rows against schema constraints, roll number duplicates,
 * numeric bounds (attended <= conducted), and existing registered profiles.
 */
export function validateAttendanceCSV(
  rawRows: string[][],
  existingProfilesByRoll: Map<string, { id: string; name: string; department: string }>
): ImportValidationSummary {
  if (rawRows.length < 2) {
    return {
      totalRows: 0,
      validCount: 0,
      invalidCount: 0,
      duplicateCount: 0,
      unmatchedCount: 0,
      rows: [],
    };
  }

  // Parse header
  const headers = rawRows[0].map((h) => h.toLowerCase().trim().replace(/\s+/g, '_'));
  const rollIdx = headers.findIndex((h) => h.includes('roll') || h === 'student_id');
  const nameIdx = headers.findIndex((h) => h.includes('name'));
  const deptIdx = headers.findIndex((h) => h.includes('dept') || h.includes('department'));
  const conductedIdx = headers.findIndex((h) => h.includes('conducted') || h === 'total_classes');
  const attendedIdx = headers.findIndex((h) => h.includes('attended') || h === 'present_classes');

  if (rollIdx === -1 || conductedIdx === -1 || attendedIdx === -1) {
    throw new Error(
      `Missing required CSV headers. Required headers: 'roll_number', 'classes_conducted', 'classes_attended'. Found: [${headers.join(', ')}]`
    );
  }

  const seenRollNumbers = new Set<string>();
  const parsedRows: ParsedAttendanceRow[] = [];
  let validCount = 0;
  let invalidCount = 0;
  let duplicateCount = 0;
  let unmatchedCount = 0;

  for (let r = 1; r < rawRows.length; r++) {
    const row = rawRows[r];
    const roll = row[rollIdx]?.trim() || '';
    const name = nameIdx !== -1 ? row[nameIdx]?.trim() || '' : '';
    const dept = deptIdx !== -1 ? row[deptIdx]?.trim() || '' : '';
    const conductedStr = row[conductedIdx]?.trim() || '';
    const attendedStr = row[attendedIdx]?.trim() || '';

    // If completely blank line, skip
    if (!roll && !conductedStr && !attendedStr) {
      continue;
    }

    const conductedNum = parseInt(conductedStr, 10);
    const attendedNum = parseInt(attendedStr, 10);

    let error: string | null = null;
    let status: 'valid' | 'invalid' | 'duplicate' | 'unmatched_student' = 'valid';

    if (!roll) {
      error = 'Roll Number is missing';
      status = 'invalid';
      invalidCount++;
    } else if (isNaN(conductedNum) || conductedNum < 0) {
      error = `Invalid classes conducted: '${conductedStr}'. Must be non-negative integer.`;
      status = 'invalid';
      invalidCount++;
    } else if (isNaN(attendedNum) || attendedNum < 0) {
      error = `Invalid classes attended: '${attendedStr}'. Must be non-negative integer.`;
      status = 'invalid';
      invalidCount++;
    } else if (attendedNum > conductedNum) {
      error = `Classes attended (${attendedNum}) exceeds classes conducted (${conductedNum}).`;
      status = 'invalid';
      invalidCount++;
    } else if (seenRollNumbers.has(roll.toUpperCase())) {
      error = `Duplicate roll number '${roll}' detected in this import batch.`;
      status = 'duplicate';
      duplicateCount++;
    } else {
      seenRollNumbers.add(roll.toUpperCase());
    }

    const matchedProfile = existingProfilesByRoll.get(roll.toUpperCase());
    const matchedStudentId = matchedProfile ? matchedProfile.id : null;

    if (status === 'valid') {
      if (!matchedProfile) {
        status = 'unmatched_student';
        error = `Unmatched student: Roll '${roll}' is not yet registered in profiles.`;
        unmatchedCount++;
      } else {
        validCount++;
      }
    }

    const percentage =
      !isNaN(conductedNum) && conductedNum > 0 && !isNaN(attendedNum)
        ? Math.round((attendedNum / conductedNum) * 10000) / 100
        : null;

    parsedRows.push({
      rowIndex: r,
      roll_number: roll,
      student_name: name || matchedProfile?.name || 'Unknown',
      department: dept || matchedProfile?.department || 'Unassigned',
      classes_conducted: isNaN(conductedNum) ? 0 : conductedNum,
      classes_attended: isNaN(attendedNum) ? 0 : attendedNum,
      attendance_percentage: percentage,
      isValid: status === 'valid' || status === 'unmatched_student',
      status,
      error,
      matchedStudentId,
    });
  }

  return {
    totalRows: parsedRows.length,
    validCount,
    invalidCount,
    duplicateCount,
    unmatchedCount,
    rows: parsedRows,
  };
}

/**
 * Generates sample CSV template content for download
 */
export function generateSampleAttendanceCSV(): string {
  return [
    'roll_number,student_name,department,classes_conducted,classes_attended',
    '21CS101,Alex Morgan,Computer Science & Engineering,100,82',
    '21CS102,David Kumar,Computer Science & Engineering,100,75',
    '21IT201,Sarah Chen,Information Technology,4,3',
    '21EC301,James Wilson,Electronics & Communication Engineering,0,0',
  ].join('\n');
}
