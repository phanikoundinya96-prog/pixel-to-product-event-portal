-- Migration: 002_attendance_generated_fix_and_registration_security.sql
-- Description: Fix attendance_percentage generated expression for 0 conducted classes (sets NULL for unavailable)
--              and enforce Student role on self-registration.

-- 1. Correct attendance_percentage calculation (0 conducted classes yields NULL/Unavailable)
ALTER TABLE academic_attendance_records DROP COLUMN IF EXISTS attendance_percentage;
ALTER TABLE academic_attendance_records ADD COLUMN attendance_percentage NUMERIC(5,2) GENERATED ALWAYS AS (
  CASE 
    WHEN classes_conducted > 0 THEN ROUND((classes_attended::numeric / classes_conducted::numeric) * 100, 2)
    ELSE NULL
  END
) STORED;

-- 2. Enforce Student role on self-registration
CREATE OR REPLACE FUNCTION enforce_student_role_on_registration()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT is_incharge_or_admin() THEN
    NEW.role := 'student';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_enforce_student_role_on_registration ON profiles;
CREATE TRIGGER trg_enforce_student_role_on_registration
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION enforce_student_role_on_registration();
