-- ============================================================================
-- Migration 004: Multi-Stage OD Approval Workflow, Decision Audit Engine & Notifications
-- ============================================================================

-- 1. Upgrade validate_request_transition to enforce the full approval state machine
CREATE OR REPLACE FUNCTION public.validate_request_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_uid TEXT;
  v_caller_role TEXT;
  v_is_assigned_proctor BOOLEAN := false;
BEGIN
  v_uid := auth.uid()::text;

  -- If status has not changed, allow update
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- 1. Prevent modification of finalized or withdrawn requests
  IF OLD.status IN ('approved_by_incharge', 'rejected_by_incharge', 'withdrawn') THEN
    RAISE EXCEPTION 'Terminal State Violation: Request is already % and cannot be modified or reopened.', OLD.status;
  END IF;

  -- Fetch caller role if authenticated
  IF v_uid IS NOT NULL AND v_uid != '' THEN
    SELECT role INTO v_caller_role FROM profiles WHERE id = v_uid;

    SELECT EXISTS (
      SELECT 1 FROM proctor_assignments
      WHERE proctor_id = v_uid AND student_id = OLD.student_id AND is_active = true
    ) INTO v_is_assigned_proctor;
  END IF;

  -- 2. State-Specific Authorization & Transitions
  -- Case A: Final approval / rejection by In-Charge
  IF NEW.status IN ('approved_by_incharge', 'rejected_by_incharge') THEN
    IF v_caller_role NOT IN ('incharge', 'admin') THEN
      RAISE EXCEPTION 'Authorization Violation: Only authorized In-Charge administrators can issue final decisions.';
    END IF;

    -- Final rejection requires non-empty remarks
    IF NEW.status = 'rejected_by_incharge' AND (NEW.admin_remarks IS NULL OR TRIM(NEW.admin_remarks) = '') THEN
      RAISE EXCEPTION 'Validation Violation: Final rejection requires a recorded reason.';
    END IF;

    -- Ensure request was already reviewed by proctor unless In-Charge overrides
    IF OLD.status NOT IN ('recommended_by_proctor', 'rejected_by_proctor', 'pending_incharge') THEN
      RAISE EXCEPTION 'Workflow Violation: Request must be reviewed by the assigned proctor before final decision.';
    END IF;
  END IF;

  -- Case B: Proctor recommendations
  IF NEW.status IN ('recommended_by_proctor', 'rejected_by_proctor') THEN
    IF v_uid = OLD.student_id THEN
      RAISE EXCEPTION 'Security Violation: Students cannot review or recommend their own requests.';
    END IF;

    IF v_caller_role NOT IN ('proctor', 'faculty', 'incharge', 'admin') THEN
      RAISE EXCEPTION 'Authorization Violation: User lacks proctor or reviewer permissions.';
    END IF;

    -- Rejection recommendation requires recorded reason
    IF NEW.status = 'rejected_by_proctor' AND (NEW.faculty_remarks IS NULL OR TRIM(NEW.faculty_remarks) = '') THEN
      RAISE EXCEPTION 'Validation Violation: Proctor rejection recommendation requires a recorded reason.';
    END IF;

    IF OLD.status NOT IN ('pending_proctor', 'submitted', 'pending_faculty') THEN
      RAISE EXCEPTION 'Workflow Violation: Cannot recommend request in current state %.', OLD.status;
    END IF;
  END IF;

  -- Case C: Return for correction
  IF NEW.status = 'returned_for_correction' THEN
    IF v_uid = OLD.student_id THEN
      RAISE EXCEPTION 'Security Violation: Students cannot return their own requests for correction.';
    END IF;

    IF (NEW.faculty_remarks IS NULL OR TRIM(NEW.faculty_remarks) = '') AND (NEW.admin_remarks IS NULL OR TRIM(NEW.admin_remarks) = '') THEN
      RAISE EXCEPTION 'Validation Violation: Actionable correction remarks are mandatory when returning a request.';
    END IF;
  END IF;

  -- Case D: Resubmission by student
  IF NEW.status IN ('pending_proctor', 'submitted') AND OLD.status = 'returned_for_correction' THEN
    IF v_uid != OLD.student_id AND v_caller_role NOT IN ('admin') THEN
      RAISE EXCEPTION 'Authorization Violation: Only the applicant student can resubmit after corrections.';
    END IF;

    -- Ensure proof document is present
    IF NEW.proof_document_key IS NULL OR NEW.proof_document_key = '' THEN
      RAISE EXCEPTION 'Validation Violation: Supporting proof document is required upon resubmission.';
    END IF;

    -- Increment resubmission count
    NEW.resubmission_count := COALESCE(OLD.resubmission_count, 0) + 1;
  END IF;

  -- Case E: Withdrawal by student
  IF NEW.status = 'withdrawn' THEN
    IF v_uid != OLD.student_id AND v_caller_role NOT IN ('admin') THEN
      RAISE EXCEPTION 'Authorization Violation: Only the applicant student can withdraw their request.';
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 2. Trigger on INSERT: Automatically record initial submission history and notify assigned proctor
CREATE OR REPLACE FUNCTION public.after_participation_request_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_student_name TEXT;
  v_proctor_id TEXT;
  v_event_title TEXT;
BEGIN
  -- Fetch student name
  SELECT name INTO v_student_name FROM profiles WHERE id = NEW.student_id;
  IF v_student_name IS NULL THEN
    v_student_name := NEW.student_name;
  END IF;

  -- Fetch event title
  SELECT title INTO v_event_title FROM events WHERE id = NEW.event_id;
  IF v_event_title IS NULL THEN
    v_event_title := 'Technical Event';
  END IF;

  -- 1. Insert Initial Audit History
  INSERT INTO request_decision_history (
    request_id,
    actor_id,
    actor_name,
    actor_role,
    previous_status,
    new_status,
    remarks
  ) VALUES (
    NEW.id,
    COALESCE(NEW.student_id, auth.uid()::text),
    v_student_name,
    'student',
    NULL,
    NEW.status,
    'Initial OD participation application submitted by student.'
  );

  -- 2. Notify Student: Submission Confirmation
  INSERT INTO system_notifications (
    recipient_id,
    title,
    message,
    type,
    link
  ) VALUES (
    NEW.student_id,
    'OD Request Submitted',
    'Your OD application for ' || v_event_title || ' (' || COALESCE(NEW.request_reference, 'OD-REQ') || ') was submitted and routed to your Proctor.',
    'info',
    '/student'
  );

  -- 3. Notify Assigned Proctor if exists
  v_proctor_id := NEW.proctor_id;
  IF v_proctor_id IS NULL THEN
    SELECT proctor_id INTO v_proctor_id
    FROM proctor_assignments
    WHERE student_id = NEW.student_id AND is_active = true
    LIMIT 1;
  END IF;

  IF v_proctor_id IS NOT NULL THEN
    INSERT INTO system_notifications (
      recipient_id,
      title,
      message,
      type,
      link
    ) VALUES (
      v_proctor_id,
      'New Student OD Request Pending Review',
      v_student_name || ' (' || NEW.roll_number || ') submitted OD request ' || COALESCE(NEW.request_reference, 'OD-REQ') || ' for ' || v_event_title || '.',
      'action_required',
      '/proctor'
    );
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_after_request_insert ON public.participation_requests;
CREATE TRIGGER trg_after_request_insert
AFTER INSERT ON public.participation_requests
FOR EACH ROW
EXECUTE FUNCTION public.after_participation_request_insert();


-- 3. Atomic Workflow Transition Procedure: process_request_workflow_action
CREATE OR REPLACE FUNCTION public.process_request_workflow_action(
  p_request_id UUID,
  p_action TEXT,
  p_remarks TEXT DEFAULT NULL,
  p_updated_fields JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_uid TEXT;
  v_actor_name TEXT;
  v_actor_role TEXT;
  v_req RECORD;
  v_new_status TEXT;
  v_event_title TEXT;
  v_proctor_id TEXT;
  v_incharge_rec RECORD;
BEGIN
  v_uid := auth.uid()::text;
  IF v_uid IS NULL OR v_uid = '' THEN
    RAISE EXCEPTION 'Authentication required: User must be signed in.';
  END IF;

  -- Fetch actor profile
  SELECT name, role INTO v_actor_name, v_actor_role FROM profiles WHERE id = v_uid;
  IF v_actor_name IS NULL THEN
    v_actor_name := 'Authorized User';
  END IF;

  -- Lock request row for update
  SELECT * INTO v_req FROM participation_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Participation request not found.';
  END IF;

  -- Fetch event title
  SELECT title INTO v_event_title FROM events WHERE id = v_req.event_id;
  IF v_event_title IS NULL THEN
    v_event_title := 'Technical Event';
  END IF;

  -- Action Dispatcher
  CASE p_action

    -- =========================================================================
    -- PROCTOR ACTIONS
    -- =========================================================================
    WHEN 'proctor_recommend' THEN
      IF v_actor_role NOT IN ('proctor', 'faculty', 'incharge', 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only faculty proctors or administrators can recommend requests.';
      END IF;

      IF v_uid = v_req.student_id THEN
        RAISE EXCEPTION 'Security Violation: Students cannot review or recommend their own requests.';
      END IF;

      IF v_req.status NOT IN ('pending_proctor', 'submitted', 'pending_faculty') THEN
        RAISE EXCEPTION 'Invalid state: Request is in state % and cannot be reviewed by proctor.', v_req.status;
      END IF;

      v_new_status := 'recommended_by_proctor';

      UPDATE participation_requests
      SET status = v_new_status,
          proctor_recommendation = 'recommended',
          faculty_reviewer_id = v_uid,
          faculty_reviewer_name = v_actor_name,
          faculty_remarks = p_remarks,
          proctor_reviewed_at = NOW(),
          updated_at = NOW()
      WHERE id = p_request_id;

      -- Audit Trail
      INSERT INTO request_decision_history (
        request_id, actor_id, actor_name, actor_role, previous_status, new_status, remarks
      ) VALUES (
        p_request_id, v_uid, v_actor_name, 'proctor', v_req.status, v_new_status, p_remarks
      );

      -- Notifications
      -- 1. Student
      INSERT INTO system_notifications (recipient_id, title, message, type, link)
      VALUES (
        v_req.student_id,
        'Proctor Endorsement Received',
        'Your proctor (' || v_actor_name || ') has recommended your OD request ' || v_req.request_reference || ' for In-Charge final approval.',
        'info',
        '/student'
      );

      -- 2. All In-Charge users
      FOR v_incharge_rec IN SELECT id FROM profiles WHERE role IN ('incharge', 'admin') LOOP
        INSERT INTO system_notifications (recipient_id, title, message, type, link)
        VALUES (
          v_incharge_rec.id,
          'OD Request Awaiting Final Approval',
          'Proctor ' || v_actor_name || ' recommended OD request ' || v_req.request_reference || ' for ' || v_req.student_name || ' (' || v_req.roll_number || ').',
          'action_required',
          '/incharge'
        );
      END LOOP;

    WHEN 'proctor_reject' THEN
      IF v_actor_role NOT IN ('proctor', 'faculty', 'incharge', 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only faculty proctors or administrators can record recommendations.';
      END IF;

      IF v_uid = v_req.student_id THEN
        RAISE EXCEPTION 'Security Violation: Students cannot review their own requests.';
      END IF;

      IF p_remarks IS NULL OR TRIM(p_remarks) = '' THEN
        RAISE EXCEPTION 'Validation Violation: A reason is mandatory when recommending rejection.';
      END IF;

      IF v_req.status NOT IN ('pending_proctor', 'submitted', 'pending_faculty') THEN
        RAISE EXCEPTION 'Invalid state: Request is in state % and cannot be reviewed by proctor.', v_req.status;
      END IF;

      v_new_status := 'rejected_by_proctor';

      UPDATE participation_requests
      SET status = v_new_status,
          proctor_recommendation = 'rejected',
          faculty_reviewer_id = v_uid,
          faculty_reviewer_name = v_actor_name,
          faculty_remarks = p_remarks,
          proctor_reviewed_at = NOW(),
          updated_at = NOW()
      WHERE id = p_request_id;

      -- Audit Trail
      INSERT INTO request_decision_history (
        request_id, actor_id, actor_name, actor_role, previous_status, new_status, remarks
      ) VALUES (
        p_request_id, v_uid, v_actor_name, 'proctor', v_req.status, v_new_status, p_remarks
      );

      -- Notifications
      -- 1. Student
      INSERT INTO system_notifications (recipient_id, title, message, type, link)
      VALUES (
        v_req.student_id,
        'Proctor Review Recorded',
        'Your proctor has reviewed OD request ' || v_req.request_reference || ' with recommendation to reject. Final decision is pending with In-Charge.',
        'warning',
        '/student'
      );

      -- 2. In-Charge users
      FOR v_incharge_rec IN SELECT id FROM profiles WHERE role IN ('incharge', 'admin') LOOP
        INSERT INTO system_notifications (recipient_id, title, message, type, link)
        VALUES (
          v_incharge_rec.id,
          'Proctor Rejection Recommendation',
          'Proctor ' || v_actor_name || ' reviewed request ' || v_req.request_reference || ' (' || v_req.student_name || ') with recommendation to reject: "' || p_remarks || '".',
          'action_required',
          '/incharge'
        );
      END LOOP;

    WHEN 'proctor_return' THEN
      IF v_actor_role NOT IN ('proctor', 'faculty', 'incharge', 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only faculty proctors or administrators can return requests.';
      END IF;

      IF v_uid = v_req.student_id THEN
        RAISE EXCEPTION 'Security Violation: Students cannot return their own requests.';
      END IF;

      IF p_remarks IS NULL OR TRIM(p_remarks) = '' THEN
        RAISE EXCEPTION 'Validation Violation: Specific correction instructions are mandatory when returning a request.';
      END IF;

      IF v_req.status NOT IN ('pending_proctor', 'submitted', 'pending_faculty') THEN
        RAISE EXCEPTION 'Invalid state: Request is in state % and cannot be returned by proctor.', v_req.status;
      END IF;

      v_new_status := 'returned_for_correction';

      UPDATE participation_requests
      SET status = v_new_status,
          faculty_reviewer_id = v_uid,
          faculty_reviewer_name = v_actor_name,
          faculty_remarks = p_remarks,
          proctor_reviewed_at = NOW(),
          updated_at = NOW()
      WHERE id = p_request_id;

      -- Audit Trail
      INSERT INTO request_decision_history (
        request_id, actor_id, actor_name, actor_role, previous_status, new_status, remarks
      ) VALUES (
        p_request_id, v_uid, v_actor_name, 'proctor', v_req.status, v_new_status, p_remarks
      );

      -- Notify Student
      INSERT INTO system_notifications (recipient_id, title, message, type, link)
      VALUES (
        v_req.student_id,
        'Action Required: OD Request Corrections Needed',
        'Your proctor (' || v_actor_name || ') requested corrections on ' || v_req.request_reference || ': "' || p_remarks || '". Please edit and resubmit.',
        'action_required',
        '/student'
      );

    -- =========================================================================
    -- IN-CHARGE ACTIONS
    -- =========================================================================
    WHEN 'incharge_approve' THEN
      IF v_actor_role NOT IN ('incharge', 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only authorized In-Charge administrators can grant final OD approval.';
      END IF;

      IF v_req.status NOT IN ('recommended_by_proctor', 'rejected_by_proctor', 'pending_incharge') THEN
        RAISE EXCEPTION 'Workflow Violation: Cannot finalize request in state %. Proctor review is required.', v_req.status;
      END IF;

      v_new_status := 'approved_by_incharge';

      UPDATE participation_requests
      SET status = v_new_status,
          incharge_decision = 'approved',
          admin_remarks = COALESCE(p_remarks, 'Approved by Technical Event In-Charge. Official OD Granted.'),
          incharge_reviewed_at = NOW(),
          incharge_id = v_uid,
          admin_reviewer_id = v_uid,
          updated_at = NOW()
      WHERE id = p_request_id;

      -- Audit Trail
      INSERT INTO request_decision_history (
        request_id, actor_id, actor_name, actor_role, previous_status, new_status, remarks
      ) VALUES (
        p_request_id, v_uid, v_actor_name, 'incharge', v_req.status, v_new_status, COALESCE(p_remarks, 'Final OD Approved.')
      );

      -- Notify Student
      INSERT INTO system_notifications (recipient_id, title, message, type, link)
      VALUES (
        v_req.student_id,
        'OD Request Approved!',
        'Congratulations! Your OD request ' || v_req.request_reference || ' for ' || v_event_title || ' has received final approval from the Technical Event In-Charge.',
        'approval',
        '/student'
      );

    WHEN 'incharge_reject' THEN
      IF v_actor_role NOT IN ('incharge', 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only authorized In-Charge administrators can reject requests.';
      END IF;

      IF p_remarks IS NULL OR TRIM(p_remarks) = '' THEN
        RAISE EXCEPTION 'Validation Violation: A reason is mandatory when issuing a final rejection.';
      END IF;

      IF v_req.status NOT IN ('recommended_by_proctor', 'rejected_by_proctor', 'pending_incharge') THEN
        RAISE EXCEPTION 'Workflow Violation: Cannot reject request in state %. Proctor review is required.', v_req.status;
      END IF;

      v_new_status := 'rejected_by_incharge';

      UPDATE participation_requests
      SET status = v_new_status,
          incharge_decision = 'rejected',
          admin_remarks = p_remarks,
          incharge_reviewed_at = NOW(),
          incharge_id = v_uid,
          admin_reviewer_id = v_uid,
          updated_at = NOW()
      WHERE id = p_request_id;

      -- Audit Trail
      INSERT INTO request_decision_history (
        request_id, actor_id, actor_name, actor_role, previous_status, new_status, remarks
      ) VALUES (
        p_request_id, v_uid, v_actor_name, 'incharge', v_req.status, v_new_status, p_remarks
      );

      -- Notify Student
      INSERT INTO system_notifications (recipient_id, title, message, type, link)
      VALUES (
        v_req.student_id,
        'OD Request Rejected',
        'Your OD application ' || v_req.request_reference || ' for ' || v_event_title || ' was rejected by the In-Charge. Reason: "' || p_remarks || '".',
        'error',
        '/student'
      );

    WHEN 'incharge_return' THEN
      IF v_actor_role NOT IN ('incharge', 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only authorized In-Charge administrators can return requests.';
      END IF;

      IF p_remarks IS NULL OR TRIM(p_remarks) = '' THEN
        RAISE EXCEPTION 'Validation Violation: Specific correction remarks are required when returning a request.';
      END IF;

      v_new_status := 'returned_for_correction';

      UPDATE participation_requests
      SET status = v_new_status,
          admin_remarks = p_remarks,
          incharge_reviewed_at = NOW(),
          incharge_id = v_uid,
          admin_reviewer_id = v_uid,
          updated_at = NOW()
      WHERE id = p_request_id;

      -- Audit Trail
      INSERT INTO request_decision_history (
        request_id, actor_id, actor_name, actor_role, previous_status, new_status, remarks
      ) VALUES (
        p_request_id, v_uid, v_actor_name, 'incharge', v_req.status, v_new_status, p_remarks
      );

      -- Notify Student
      INSERT INTO system_notifications (recipient_id, title, message, type, link)
      VALUES (
        v_req.student_id,
        'In-Charge Requested Corrections',
        'The Event In-Charge requested corrections on OD application ' || v_req.request_reference || ': "' || p_remarks || '". Please edit and resubmit.',
        'action_required',
        '/student'
      );

    -- =========================================================================
    -- STUDENT ACTIONS
    -- =========================================================================
    WHEN 'student_resubmit' THEN
      IF v_uid != v_req.student_id AND v_actor_role NOT IN ('admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only the applicant student can resubmit this request.';
      END IF;

      IF v_req.status NOT IN ('returned_for_correction', 'changes_requested') THEN
        RAISE EXCEPTION 'Invalid state: Only requests marked returned for correction can be resubmitted.';
      END IF;

      v_new_status := 'pending_proctor';

      -- Apply updated fields if provided
      UPDATE participation_requests
      SET status = v_new_status,
          resubmission_count = COALESCE(v_req.resubmission_count, 0) + 1,
          reason_statement = COALESCE((p_updated_fields->>'reason_statement')::text, reason_statement),
          event_role = COALESCE((p_updated_fields->>'event_role')::text, event_role),
          event_website_url = COALESCE((p_updated_fields->>'event_website_url')::text, event_website_url),
          event_city = COALESCE((p_updated_fields->>'event_city')::text, event_city),
          proof_document_key = COALESCE((p_updated_fields->>'proof_document_key')::text, proof_document_key),
          proof_document_url = COALESCE((p_updated_fields->>'proof_document_url')::text, proof_document_url),
          updated_at = NOW()
      WHERE id = p_request_id;

      -- Audit Trail
      INSERT INTO request_decision_history (
        request_id, actor_id, actor_name, actor_role, previous_status, new_status, remarks
      ) VALUES (
        p_request_id, v_uid, v_actor_name, 'student', v_req.status, v_new_status,
        COALESCE(p_remarks, 'Student updated request details and resubmitted for proctor review.')
      );

      -- Notify Proctor
      v_proctor_id := v_req.proctor_id;
      IF v_proctor_id IS NULL THEN
        SELECT proctor_id INTO v_proctor_id
        FROM proctor_assignments
        WHERE student_id = v_req.student_id AND is_active = true
        LIMIT 1;
      END IF;

      IF v_proctor_id IS NOT NULL THEN
        INSERT INTO system_notifications (recipient_id, title, message, type, link)
        VALUES (
          v_proctor_id,
          'Student Resubmitted OD Request',
          v_actor_name || ' (' || v_req.roll_number || ') resubmitted corrected OD request ' || v_req.request_reference || ' for review.',
          'action_required',
          '/proctor'
        );
      END IF;

    WHEN 'student_withdraw' THEN
      IF v_uid != v_req.student_id AND v_actor_role NOT IN ('admin') THEN
        RAISE EXCEPTION 'Unauthorized: Only the applicant student can withdraw this request.';
      END IF;

      IF v_req.status IN ('approved_by_incharge', 'rejected_by_incharge', 'withdrawn') THEN
        RAISE EXCEPTION 'Invalid state: Finalized requests cannot be withdrawn.';
      END IF;

      v_new_status := 'withdrawn';

      UPDATE participation_requests
      SET status = v_new_status,
          updated_at = NOW()
      WHERE id = p_request_id;

      -- Audit Trail
      INSERT INTO request_decision_history (
        request_id, actor_id, actor_name, actor_role, previous_status, new_status, remarks
      ) VALUES (
        p_request_id, v_uid, v_actor_name, 'student', v_req.status, v_new_status,
        COALESCE(p_remarks, 'Application voluntarily withdrawn by student.')
      );

    ELSE
      RAISE EXCEPTION 'Unknown workflow action: %', p_action;
  END CASE;

  RETURN jsonb_build_object(
    'success', true,
    'request_id', p_request_id,
    'previous_status', v_req.status,
    'new_status', v_new_status,
    'actor_id', v_uid,
    'actor_name', v_actor_name,
    'action', p_action
  );
END;
$function$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.process_request_workflow_action(UUID, TEXT, TEXT, JSONB) TO authenticated;
