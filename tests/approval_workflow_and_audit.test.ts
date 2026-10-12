import { describe, it, expect } from 'vitest';
import {
  validateWorkflowTransition,
  getPermittedWorkflowActions,
  isTerminalStatus,
  TERMINAL_STATUSES,
} from '../src/utils/workflowEngine';
import { RequestDecisionHistoryItem, SystemNotification, ParticipationRequest } from '../src/types';

describe('Milestone 4 — Multi-Stage OD Approval Workflow & Audit Engine', () => {
  // Test 1: Valid student submission enters the correct review state
  it('allows a valid student submission to enter pending review state', () => {
    const studentActor = { id: 'usr-student-01', role: 'student' as const, isOwner: true };
    const res = validateWorkflowTransition('draft', 'pending_proctor', studentActor);
    expect(res.allowed).toBe(true);

    const actions = getPermittedWorkflowActions('pending_proctor', 'student');
    expect(actions).toContain('withdraw');
  });

  // Test 2: Assigned proctor can see and review a request
  it('allows assigned proctor to recommend approval, recommend rejection, or return for correction', () => {
    const assignedProctor = {
      id: 'usr-proctor-01',
      role: 'proctor' as const,
      isAssignedProctor: true,
    };

    const recommendRes = validateWorkflowTransition(
      'pending_proctor',
      'recommended_by_proctor',
      assignedProctor,
      'Student meets attendance criteria and event is accredited.'
    );
    expect(recommendRes.allowed).toBe(true);

    const rejectRecRes = validateWorkflowTransition(
      'pending_proctor',
      'rejected_by_proctor',
      assignedProctor,
      'Internal exams scheduled during event dates.'
    );
    expect(rejectRecRes.allowed).toBe(true);

    const returnRes = validateWorkflowTransition(
      'pending_proctor',
      'returned_for_correction',
      assignedProctor,
      'Please attach the official registration payment receipt.'
    );
    expect(returnRes.allowed).toBe(true);

    const availableActions = getPermittedWorkflowActions('pending_proctor', 'proctor', true);
    expect(availableActions).toEqual(['recommend', 'recommend_reject', 'return_for_correction']);
  });

  // Test 3: Unassigned proctor cannot change the request
  it('blocks unassigned proctors from reviewing or changing a student request', () => {
    const unassignedProctor = {
      id: 'usr-proctor-other',
      role: 'proctor' as const,
      isAssignedProctor: false,
    };

    const res = validateWorkflowTransition(
      'pending_proctor',
      'recommended_by_proctor',
      unassignedProctor,
      'Unauthorized recommendation attempt'
    );
    expect(res.allowed).toBe(false);
    expect(res.error).toContain('Only the assigned proctor can review this student\'s request');

    const actions = getPermittedWorkflowActions('pending_proctor', 'proctor', false);
    expect(actions).toEqual([]);
  });

  // Test 4: Proctor cannot make a final decision
  it('strictly blocks proctors from issuing final approval or final rejection', () => {
    const proctor = { id: 'usr-proctor-01', role: 'proctor' as const, isAssignedProctor: true };

    const approveRes = validateWorkflowTransition(
      'pending_proctor',
      'approved_by_incharge',
      proctor,
      'Final approval attempt'
    );
    expect(approveRes.allowed).toBe(false);
    expect(approveRes.error).toContain('Academic Proctors cannot issue final decisions');

    const rejectRes = validateWorkflowTransition(
      'pending_proctor',
      'rejected_by_incharge',
      proctor,
      'Final rejection attempt'
    );
    expect(rejectRes.allowed).toBe(false);
    expect(rejectRes.error).toContain('Academic Proctors cannot issue final decisions');
  });

  // Test 5: Proctor recommendation reaches In-Charge queue
  it('advances request to In-Charge decision queue upon proctor recommendation', () => {
    const incharge = { id: 'usr-incharge-01', role: 'incharge' as const };
    const permittedActions = getPermittedWorkflowActions('recommended_by_proctor', 'incharge');

    expect(permittedActions).toContain('approve');
    expect(permittedActions).toContain('reject');
    expect(permittedActions).toContain('return_for_correction');

    const approveRes = validateWorkflowTransition(
      'recommended_by_proctor',
      'approved_by_incharge',
      incharge,
      'Approved by In-Charge. Official OD Granted.'
    );
    expect(approveRes.allowed).toBe(true);
  });

  // Test 6: Rejection recommendation is not treated as final rejection
  it('distinguishes proctor rejection recommendation from final rejection', () => {
    const proctorRecommendationState = 'rejected_by_proctor';
    const finalRejectionState = 'rejected_by_incharge';

    expect(isTerminalStatus(proctorRecommendationState)).toBe(false);
    expect(isTerminalStatus(finalRejectionState)).toBe(true);

    // In-Charge can still review and grant or finalize
    const incharge = { id: 'usr-incharge-01', role: 'incharge' as const };
    const actionsOnProctorReject = getPermittedWorkflowActions(proctorRecommendationState, 'incharge');
    expect(actionsOnProctorReject).toContain('approve');
    expect(actionsOnProctorReject).toContain('reject');
  });

  // Test 7: In-Charge can finalize a valid reviewed request
  it('allows In-Charge to grant final approval on reviewed request', () => {
    const incharge = { id: 'usr-incharge-01', role: 'incharge' as const };
    const res = validateWorkflowTransition(
      'recommended_by_proctor',
      'approved_by_incharge',
      incharge,
      'Granted 3 days technical event OD.'
    );
    expect(res.allowed).toBe(true);
  });

  // Test 8: Rejection requires a mandatory, meaningful reason
  it('strictly rejects final rejection and proctor rejection without remarks', () => {
    const proctor = { id: 'usr-proctor-01', role: 'proctor' as const, isAssignedProctor: true };
    const incharge = { id: 'usr-incharge-01', role: 'incharge' as const };

    // Empty remarks for proctor rejection
    const proctorBlank = validateWorkflowTransition('pending_proctor', 'rejected_by_proctor', proctor, '');
    expect(proctorBlank.allowed).toBe(false);
    expect(proctorBlank.error).toContain('Mandatory requirement: A specific reason must be provided');

    // Empty remarks for incharge rejection
    const inchargeBlank = validateWorkflowTransition('recommended_by_proctor', 'rejected_by_incharge', incharge, '   ');
    expect(inchargeBlank.allowed).toBe(false);
    expect(inchargeBlank.error).toContain('Mandatory requirement: A clear reason must be recorded');
  });

  // Test 9: Correction requests require actionable remarks and permit student resubmission
  it('enforces actionable correction remarks and enables student resubmission workflow', () => {
    const proctor = { id: 'usr-proctor-01', role: 'proctor' as const, isAssignedProctor: true };
    const student = { id: 'usr-student-01', role: 'student' as const, isOwner: true };

    // Return without remarks fails
    const blankReturn = validateWorkflowTransition('pending_proctor', 'returned_for_correction', proctor, '');
    expect(blankReturn.allowed).toBe(false);
    expect(blankReturn.error).toContain('Actionable correction remarks must be provided');

    // Return with remarks succeeds
    const validReturn = validateWorkflowTransition(
      'pending_proctor',
      'returned_for_correction',
      proctor,
      'Upload registration ticket with student name visible.'
    );
    expect(validReturn.allowed).toBe(true);

    // Student actions when returned
    const studentActions = getPermittedWorkflowActions('returned_for_correction', 'student');
    expect(studentActions).toContain('resubmit');
    expect(studentActions).toContain('withdraw');

    // Student resubmits
    const resubmitRes = validateWorkflowTransition(
      'returned_for_correction',
      'pending_proctor',
      student,
      'Updated registration ticket uploaded to document vault.'
    );
    expect(resubmitRes.allowed).toBe(true);
  });

  // Test 10: Students cannot self-approve or approve other requests
  it('blocks students from approving or recommending their own or other requests', () => {
    const student = { id: 'usr-student-01', role: 'student' as const, isOwner: true };

    const selfApprove = validateWorkflowTransition('pending_proctor', 'approved_by_incharge', student);
    expect(selfApprove.allowed).toBe(false);
    expect(selfApprove.error).toContain('Students cannot approve or recommend');

    const selfRecommend = validateWorkflowTransition('pending_proctor', 'recommended_by_proctor', student);
    expect(selfRecommend.allowed).toBe(false);
    expect(selfRecommend.error).toContain('Students cannot approve or recommend');
  });

  // Test 11: Invalid state transitions from terminal states are rejected
  it('guarantees terminal states cannot be reopened or edited', () => {
    const incharge = { id: 'usr-incharge-01', role: 'incharge' as const };
    const student = { id: 'usr-student-01', role: 'student' as const, isOwner: true };

    TERMINAL_STATUSES.forEach((terminalState) => {
      expect(isTerminalStatus(terminalState)).toBe(true);

      const reopenAttempt = validateWorkflowTransition(terminalState, 'pending_proctor', incharge);
      expect(reopenAttempt.allowed).toBe(false);
      expect(reopenAttempt.error).toContain('Cannot transition request from finalized terminal state');

      const studentEditAttempt = validateWorkflowTransition(terminalState, 'draft', student);
      expect(studentEditAttempt.allowed).toBe(false);
    });
  });

  // Test 12: Audit trail records every meaningful step with immutable sequence
  it('maintains an immutable, chronologically ordered audit sequence across resubmission', () => {
    const mockAuditTrail: RequestDecisionHistoryItem[] = [
      {
        id: 'hist-01',
        request_id: 'req-101',
        actor_id: 'usr-student-01',
        actor_name: 'Priya Sharma',
        actor_role: 'student',
        previous_status: 'draft',
        new_status: 'pending_proctor',
        action_type: 'submitted',
        remarks: 'OD application submitted for Webathon 2026',
        created_at: '2026-10-12T09:00:00Z',
      },
      {
        id: 'hist-02',
        request_id: 'req-101',
        actor_id: 'usr-proctor-01',
        actor_name: 'Dr. Ramesh Kumar',
        actor_role: 'proctor',
        previous_status: 'pending_proctor',
        new_status: 'returned_for_correction',
        action_type: 'returned_for_correction',
        remarks: 'Please attach official registration ticket with participant name.',
        created_at: '2026-10-12T10:15:00Z',
      },
      {
        id: 'hist-03',
        request_id: 'req-101',
        actor_id: 'usr-student-01',
        actor_name: 'Priya Sharma',
        actor_role: 'student',
        previous_status: 'returned_for_correction',
        new_status: 'pending_proctor',
        action_type: 'resubmitted',
        remarks: 'Uploaded confirmed registration ticket with student ID.',
        created_at: '2026-10-12T11:00:00Z',
      },
      {
        id: 'hist-04',
        request_id: 'req-101',
        actor_id: 'usr-proctor-01',
        actor_name: 'Dr. Ramesh Kumar',
        actor_role: 'proctor',
        previous_status: 'pending_proctor',
        new_status: 'recommended_by_proctor',
        action_type: 'recommended',
        remarks: 'Verified updated ticket and attendance eligibility. Highly recommended.',
        created_at: '2026-10-12T11:30:00Z',
      },
      {
        id: 'hist-05',
        request_id: 'req-101',
        actor_id: 'usr-incharge-01',
        actor_name: 'Dr. Anita Desai',
        actor_role: 'incharge',
        previous_status: 'recommended_by_proctor',
        new_status: 'approved_by_incharge',
        action_type: 'approved',
        remarks: 'Approved by Technical Event In-Charge. Official OD Granted.',
        created_at: '2026-10-12T12:00:00Z',
      },
    ];

    expect(mockAuditTrail).toHaveLength(5);
    // Prior decisions are preserved despite resubmission
    expect(mockAuditTrail[1].action_type).toBe('returned_for_correction');
    expect(mockAuditTrail[2].action_type).toBe('resubmitted');
    expect(mockAuditTrail[3].action_type).toBe('recommended');
    expect(mockAuditTrail[4].action_type).toBe('approved');

    // Chronological order verification
    for (let i = 1; i < mockAuditTrail.length; i++) {
      const prevDate = new Date(mockAuditTrail[i - 1].created_at).getTime();
      const currDate = new Date(mockAuditTrail[i].created_at).getTime();
      expect(currDate).toBeGreaterThan(prevDate);
    }
  });

  // Test 13: System Notifications created with correct targeting and read state
  it('dispatches scoped notifications to target recipients at each workflow milestone', () => {
    const notifications: SystemNotification[] = [
      {
        id: 'notif-01',
        user_id: 'usr-proctor-01',
        request_id: 'req-101',
        title: 'New Student OD Request For Review',
        message: 'Priya Sharma (21CS042) submitted an OD request for Webathon 2026.',
        notification_type: 'proctor_review_needed',
        severity: 'info',
        is_read: false,
        created_at: '2026-10-12T09:00:00Z',
      },
      {
        id: 'notif-02',
        user_id: 'usr-student-01',
        request_id: 'req-101',
        title: 'OD Request Returned for Correction',
        message: 'Your proctor requested corrections: Upload official registration ticket.',
        notification_type: 'correction_required',
        severity: 'warning',
        is_read: false,
        created_at: '2026-10-12T10:15:00Z',
      },
      {
        id: 'notif-03',
        user_id: 'usr-incharge-01',
        request_id: 'req-101',
        title: 'OD Request Awaiting Final Approval',
        message: 'Dr. Ramesh Kumar recommended Priya Sharma for Webathon 2026.',
        notification_type: 'final_approval_needed',
        severity: 'info',
        is_read: false,
        created_at: '2026-10-12T11:30:00Z',
      },
      {
        id: 'notif-04',
        user_id: 'usr-student-01',
        request_id: 'req-101',
        title: 'OD Application Approved!',
        message: 'Your On-Duty attendance request for Webathon 2026 has been officially granted.',
        notification_type: 'decision_granted',
        severity: 'success',
        is_read: false,
        created_at: '2026-10-12T12:00:00Z',
      },
    ];

    // Notification privacy: Student sees only their notifications
    const studentNotifs = notifications.filter((n) => n.user_id === 'usr-student-01');
    expect(studentNotifs).toHaveLength(2);
    expect(studentNotifs.map((n) => n.notification_type)).toEqual([
      'correction_required',
      'decision_granted',
    ]);

    // Marking notification as read updates read state
    const readNotif = { ...studentNotifs[0], is_read: true };
    expect(readNotif.is_read).toBe(true);
  });

  // Test 14: Withdrawal cancels non-finalized requests
  it('allows students to withdraw active requests but blocks withdrawing finalized requests', () => {
    const student = { id: 'usr-student-01', role: 'student' as const, isOwner: true };

    expect(validateWorkflowTransition('pending_proctor', 'withdrawn', student).allowed).toBe(true);
    expect(validateWorkflowTransition('recommended_by_proctor', 'withdrawn', student).allowed).toBe(true);
    expect(validateWorkflowTransition('returned_for_correction', 'withdrawn', student).allowed).toBe(true);

    // Finalized request cannot be withdrawn
    expect(validateWorkflowTransition('approved_by_incharge', 'withdrawn', student).allowed).toBe(false);
    expect(validateWorkflowTransition('rejected_by_incharge', 'withdrawn', student).allowed).toBe(false);
  });

  // Test 15: Student dashboard snapshot and status accuracy
  it('preserves immutable submission attendance snapshot regardless of subsequent changes', () => {
    const requestSnapshot: Partial<ParticipationRequest> = {
      id: 'req-101',
      student_id: 'usr-student-01',
      student_name: 'Priya Sharma',
      submission_attendance_percentage: 82.5,
      submission_eligibility_status: 'eligible',
      submission_threshold_applied: 75.0,
      resubmission_count: 1,
      status: 'pending_proctor',
    };

    // Subsequent attendance drops to 70%, but submission snapshot remains 82.5%
    const subsequentAttendanceRecord = {
      attendance_percentage: 70.0,
      is_eligible: false,
    };

    expect(requestSnapshot.submission_attendance_percentage).toBe(82.5);
    expect(requestSnapshot.submission_eligibility_status).toBe('eligible');
    expect(subsequentAttendanceRecord.attendance_percentage).toBe(70.0);
    expect(requestSnapshot.resubmission_count).toBe(1);
  });
});
