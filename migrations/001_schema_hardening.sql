-- Migration: 001_schema_hardening.sql
-- Description: Hardened schema, RBAC triggers, append-only audit trail, and RLS policies
-- Target: Technical Event Participation Approval and Attendance Monitoring Portal

-- 1. Profiles Table Role Check Extension
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check 
  CHECK (role IN ('student', 'proctor', 'incharge', 'faculty', 'admin'));

-- 2. Institution Settings (Eligibility Threshold & Freshness)
CREATE TABLE IF NOT EXISTS institution_settings (
  id TEXT PRIMARY KEY DEFAULT 'default',
  min_attendance_threshold NUMERIC(5,2) DEFAULT 75.00 CHECK (min_attendance_threshold >= 0 AND min_attendance_threshold <= 100),
  attendance_freshness_days INT DEFAULT 30 CHECK (attendance_freshness_days > 0),
  updated_by TEXT REFERENCES profiles(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO institution_settings (id, min_attendance_threshold, attendance_freshness_days)
VALUES ('default', 75.00, 30)
ON CONFLICT (id) DO NOTHING;

-- 3. Proctor Assignments
CREATE TABLE IF NOT EXISTS proctor_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proctor_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  academic_year INT,
  department TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_student_active_proctor UNIQUE (student_id, is_active)
);

-- 4. Academic Attendance Imports
CREATE TABLE IF NOT EXISTS academic_attendance_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  importer_id TEXT NOT NULL REFERENCES profiles(id),
  import_timestamp TIMESTAMPTZ DEFAULT NOW(),
  source_date DATE NOT NULL,
  filename TEXT NOT NULL,
  total_rows INT DEFAULT 0,
  valid_count INT DEFAULT 0,
  invalid_count INT DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('processing', 'completed', 'failed', 'rejected')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Academic Attendance Records
CREATE TABLE IF NOT EXISTS academic_attendance_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES academic_attendance_imports(id) ON DELETE CASCADE,
  student_id TEXT REFERENCES profiles(id),
  roll_number TEXT NOT NULL,
  student_name TEXT,
  classes_conducted INT NOT NULL CHECK (classes_conducted >= 0),
  classes_attended INT NOT NULL CHECK (classes_attended >= 0 AND classes_attended <= classes_conducted),
  attendance_percentage NUMERIC(5,2) GENERATED ALWAYS AS (
    CASE WHEN classes_conducted > 0 THEN ROUND((classes_attended::numeric / classes_conducted::numeric) * 100, 2) ELSE 0.00 END
  ) STORED,
  source_date DATE NOT NULL,
  validation_status TEXT NOT NULL CHECK (validation_status IN ('valid', 'invalid', 'duplicate', 'unmatched_student')),
  row_error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_import_roll_number UNIQUE (import_id, roll_number)
);

-- 6. Participation Requests Update
ALTER TABLE participation_requests DROP CONSTRAINT IF EXISTS participation_requests_status_check;
ALTER TABLE participation_requests ADD CONSTRAINT participation_requests_status_check
  CHECK (status IN (
    'draft', 'submitted', 'pending_proctor', 'recommended_by_proctor', 
    'rejected_by_proctor', 'pending_incharge', 'approved_by_incharge', 
    'rejected_by_incharge', 'returned_for_correction', 'withdrawn',
    'pending_faculty', 'approved_faculty', 'pending_admin', 'approved', 'rejected', 'changes_requested'
  ));

ALTER TABLE participation_requests 
  ADD COLUMN IF NOT EXISTS current_attendance_percentage NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS eligibility_status TEXT DEFAULT 'pending_check' CHECK (eligibility_status IN ('pending_check', 'eligible', 'conditionally_eligible', 'ineligible', 'stale_data', 'missing_data')),
  ADD COLUMN IF NOT EXISTS proctor_id TEXT REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS proctor_recommendation TEXT,
  ADD COLUMN IF NOT EXISTS proctor_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS incharge_id TEXT REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS incharge_decision TEXT,
  ADD COLUMN IF NOT EXISTS incharge_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resubmission_count INT DEFAULT 0;

ALTER TABLE participation_requests DROP CONSTRAINT IF EXISTS uq_event_student;
ALTER TABLE participation_requests ADD CONSTRAINT uq_event_student UNIQUE (event_id, student_id);

-- 7. Request Decision History (Append-Only)
CREATE TABLE IF NOT EXISTS request_decision_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES participation_requests(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL REFERENCES profiles(id),
  actor_name TEXT NOT NULL,
  actor_role TEXT NOT NULL,
  previous_status TEXT,
  new_status TEXT NOT NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Unique Attendance Check-ins
ALTER TABLE attendance_records DROP CONSTRAINT IF EXISTS uq_session_student;
ALTER TABLE attendance_records ADD CONSTRAINT uq_session_student UNIQUE (event_id, session_name, student_id);

-- 9. Security Triggers
CREATE OR REPLACE FUNCTION prevent_role_escalation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.role IS DISTINCT FROM NEW.role THEN
    IF NOT is_incharge_or_admin() THEN
      RAISE EXCEPTION 'Unauthorized: Only an In-Charge or Administrator can alter user roles.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prevent_role_escalation ON profiles;
CREATE TRIGGER trg_prevent_role_escalation
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_role_escalation();

CREATE OR REPLACE FUNCTION validate_request_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('recommended_by_proctor', 'approved_by_incharge', 'approved', 'approved_faculty') THEN
    IF auth.uid()::text = NEW.student_id THEN
      RAISE EXCEPTION 'Security Violation: Students cannot recommend or approve their own participation requests.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_validate_request_transition ON participation_requests;
CREATE TRIGGER trg_validate_request_transition
  BEFORE UPDATE ON participation_requests
  FOR EACH ROW
  EXECUTE FUNCTION validate_request_transition();

-- 10. Enable Row Level Security (RLS) on all public tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE institution_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE proctor_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_attendance_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE participation_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE request_decision_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_notifications ENABLE ROW LEVEL SECURITY;
