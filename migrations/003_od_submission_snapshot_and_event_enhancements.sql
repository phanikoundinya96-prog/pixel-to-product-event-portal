-- Migration: 003_od_submission_snapshot_and_event_enhancements.sql
-- Description: Adds immutable submission-time attendance snapshots, request references,
--              identity protection, date validation, and supporting proof verification trigger.

-- 1. Add columns to participation_requests
ALTER TABLE participation_requests 
  ADD COLUMN IF NOT EXISTS request_reference TEXT,
  ADD COLUMN IF NOT EXISTS event_website_url TEXT,
  ADD COLUMN IF NOT EXISTS event_city TEXT,
  ADD COLUMN IF NOT EXISTS od_start_date DATE,
  ADD COLUMN IF NOT EXISTS od_end_date DATE,
  ADD COLUMN IF NOT EXISTS submission_attendance_percentage NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS submission_eligibility_status TEXT,
  ADD COLUMN IF NOT EXISTS submission_threshold_applied NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS submission_source_date DATE,
  ADD COLUMN IF NOT EXISTS submission_import_id UUID REFERENCES academic_attendance_imports(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submission_checked_at TIMESTAMPTZ;

-- 2. Unique constraint on request_reference
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_request_reference'
  ) THEN
    ALTER TABLE participation_requests ADD CONSTRAINT uq_request_reference UNIQUE (request_reference);
  END IF;
END $$;

-- 3. Trigger for participation_requests preparation & snapshotting
CREATE OR REPLACE FUNCTION prepare_participation_request()
RETURNS TRIGGER AS $$
DECLARE
  v_name TEXT;
  v_email TEXT;
  v_roll TEXT;
  v_dept TEXT;
  v_pct NUMERIC(5,2);
  v_source_date DATE;
  v_import_id UUID;
  v_threshold NUMERIC(5,2);
  v_freshness_days INT;
  v_proctor_id TEXT;
  v_uid TEXT;
BEGIN
  v_uid := auth.uid()::text;
  
  -- If invoked in an authenticated context, force student_id to auth.uid()
  IF v_uid IS NOT NULL AND v_uid != '' THEN
    NEW.student_id := v_uid;
  END IF;

  -- Authoritatively pull identity from profiles
  SELECT name, email, roll_number, department
  INTO v_name, v_email, v_roll, v_dept
  FROM profiles
  WHERE id = NEW.student_id;

  IF v_name IS NOT NULL THEN
    NEW.student_name := v_name;
    NEW.student_email := v_email;
    NEW.roll_number := COALESCE(v_roll, NEW.roll_number);
    NEW.department := COALESCE(v_dept, NEW.department);
  END IF;

  -- Generate human-readable request reference if null
  IF NEW.request_reference IS NULL OR NEW.request_reference = '' THEN
    NEW.request_reference := 'OD-2026-' || UPPER(SUBSTRING(COALESCE(NEW.id, gen_random_uuid())::text, 1, 8));
  END IF;

  -- Date validation
  IF NEW.od_start_date IS NOT NULL AND NEW.od_end_date IS NOT NULL AND NEW.od_end_date < NEW.od_start_date THEN
    RAISE EXCEPTION 'Invalid date range: End date cannot be earlier than start date.';
  END IF;

  -- Auto-link assigned proctor if available
  SELECT proctor_id INTO v_proctor_id
  FROM proctor_assignments
  WHERE student_id = NEW.student_id AND is_active = true
  LIMIT 1;

  IF v_proctor_id IS NOT NULL AND (NEW.proctor_id IS NULL OR NEW.proctor_id = '') THEN
    NEW.proctor_id := v_proctor_id;
  END IF;

  -- Derive submission-time attendance snapshot from latest completed import
  SELECT aar.attendance_percentage, aar.source_date, aar.import_id
  INTO v_pct, v_source_date, v_import_id
  FROM academic_attendance_records aar
  JOIN academic_attendance_imports aai ON aai.id = aar.import_id
  WHERE aai.status = 'completed' 
    AND (aar.student_id = NEW.student_id OR UPPER(aar.roll_number) = UPPER(COALESCE(NEW.roll_number, '')))
  ORDER BY aai.source_date DESC, aai.import_timestamp DESC
  LIMIT 1;

  SELECT min_attendance_threshold, attendance_freshness_days
  INTO v_threshold, v_freshness_days
  FROM institution_settings WHERE id = 'default';

  NEW.submission_threshold_applied := COALESCE(v_threshold, 75.00);
  NEW.submission_checked_at := NOW();
  NEW.submission_attendance_percentage := v_pct;
  NEW.submission_source_date := v_source_date;
  NEW.submission_import_id := v_import_id;

  IF v_pct IS NULL THEN
    NEW.submission_eligibility_status := 'unavailable';
  ELSIF v_source_date IS NOT NULL AND (CURRENT_DATE - v_source_date) > COALESCE(v_freshness_days, 30) THEN
    NEW.submission_eligibility_status := 'stale_data';
  ELSIF v_pct >= COALESCE(v_threshold, 75.00) THEN
    NEW.submission_eligibility_status := 'eligible';
  ELSE
    NEW.submission_eligibility_status := 'ineligible';
  END IF;

  NEW.current_attendance_percentage := NEW.submission_attendance_percentage;
  NEW.eligibility_status := NEW.submission_eligibility_status;

  -- Document check for submitted status
  IF NEW.status IN ('submitted', 'pending_proctor') AND (NEW.proof_document_key IS NULL OR NEW.proof_document_key = '') THEN
    RAISE EXCEPTION 'A supporting proof document must be uploaded to the vault before submitting the OD request.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_prepare_participation_request ON participation_requests;
CREATE TRIGGER trg_prepare_participation_request
  BEFORE INSERT ON participation_requests
  FOR EACH ROW
  EXECUTE FUNCTION prepare_participation_request();
