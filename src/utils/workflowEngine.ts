import { RequestStatus, UserRole } from '@/types';

export interface WorkflowTransitionResult {
  allowed: boolean;
  error?: string;
}

export interface WorkflowActor {
  id: string;
  role: UserRole | 'admin' | 'incharge' | 'proctor' | 'student';
  isOwner?: boolean;
  isAssignedProctor?: boolean;
}

/**
 * Terminal states in the OD approval lifecycle.
 * Requests in these states cannot be transitioned to any other state.
 */
export const TERMINAL_STATUSES: readonly RequestStatus[] = [
  'approved',
  'approved_by_incharge',
  'rejected',
  'rejected_by_incharge',
  'withdrawn',
] as const;

export function isTerminalStatus(status: RequestStatus | string): boolean {
  return TERMINAL_STATUSES.includes(status as RequestStatus);
}

/**
 * Validates a state transition according to institutional OD workflow policies.
 */
export function validateWorkflowTransition(
  currentStatus: RequestStatus | string,
  targetStatus: RequestStatus | string,
  actor: WorkflowActor,
  remarks?: string
): WorkflowTransitionResult {
  // 1. Prevent transitions from terminal states
  if (isTerminalStatus(currentStatus)) {
    return {
      allowed: false,
      error: `Cannot transition request from finalized terminal state '${currentStatus}'. Terminal records are immutable.`,
    };
  }

  // 2. Prevent self-approval by student applicant
  if (actor.role === 'student' || actor.isOwner) {
    if (
      targetStatus === 'approved' ||
      targetStatus === 'approved_by_incharge' ||
      targetStatus === 'recommended_by_proctor'
    ) {
      return {
        allowed: false,
        error: 'Unauthorized: Students cannot approve or recommend their own participation requests.',
      };
    }
  }

  // 3. Proctor Role Permissions & Constraints
  if (actor.role === 'proctor') {
    // Proctors cannot issue final approvals or final rejections
    if (
      targetStatus === 'approved' ||
      targetStatus === 'approved_by_incharge' ||
      targetStatus === 'rejected' ||
      targetStatus === 'rejected_by_incharge'
    ) {
      return {
        allowed: false,
        error: 'Unauthorized: Academic Proctors cannot issue final decisions. Final approval/rejection is reserved for the Technical Event In-Charge.',
      };
    }

    // Proctor must be assigned to student
    if (actor.isAssignedProctor === false) {
      return {
        allowed: false,
        error: 'Unauthorized: Only the assigned proctor can review this student\'s request.',
      };
    }

    // Proctor actions require specific review states
    const validProctorTargets = [
      'recommended_by_proctor',
      'rejected_by_proctor',
      'returned_for_correction',
    ];

    if (!validProctorTargets.includes(targetStatus)) {
      return {
        allowed: false,
        error: `Invalid transition for proctor: cannot change '${currentStatus}' to '${targetStatus}'.`,
      };
    }

    // Proctor rejection recommendation requires mandatory reason
    if (targetStatus === 'rejected_by_proctor' && (!remarks || !remarks.trim())) {
      return {
        allowed: false,
        error: 'Mandatory requirement: A specific reason must be provided when recommending rejection.',
      };
    }

    // Return for correction requires mandatory actionable remarks
    if (targetStatus === 'returned_for_correction' && (!remarks || !remarks.trim())) {
      return {
        allowed: false,
        error: 'Mandatory requirement: Actionable correction remarks must be provided when returning a request.',
      };
    }

    return { allowed: true };
  }

  // 4. In-Charge Role Permissions & Constraints
  if (actor.role === 'incharge' || actor.role === 'admin') {
    const validInchargeTargets = [
      'approved',
      'approved_by_incharge',
      'rejected',
      'rejected_by_incharge',
      'returned_for_correction',
    ];

    if (!validInchargeTargets.includes(targetStatus)) {
      return {
        allowed: false,
        error: `Invalid transition for In-Charge: cannot change '${currentStatus}' to '${targetStatus}'.`,
      };
    }

    // Rejection requires mandatory reason
    if (
      (targetStatus === 'rejected' || targetStatus === 'rejected_by_incharge') &&
      (!remarks || !remarks.trim())
    ) {
      return {
        allowed: false,
        error: 'Mandatory requirement: A clear reason must be recorded for final rejection.',
      };
    }

    // Return for correction requires remarks
    if (targetStatus === 'returned_for_correction' && (!remarks || !remarks.trim())) {
      return {
        allowed: false,
        error: 'Mandatory requirement: Clear correction instructions must be provided when returning a request.',
      };
    }

    return { allowed: true };
  }

  // 5. Student Role Permissions & Constraints
  if (actor.role === 'student') {
    // Student can withdraw non-terminal request
    if (targetStatus === 'withdrawn') {
      return { allowed: true };
    }

    // Student can submit draft
    if (
      (currentStatus === 'draft') &&
      (targetStatus === 'submitted' || targetStatus === 'pending_proctor')
    ) {
      return { allowed: true };
    }

    // Student can resubmit returned request
    if (
      currentStatus === 'returned_for_correction' &&
      (targetStatus === 'submitted' || targetStatus === 'pending_proctor')
    ) {
      if (!remarks || !remarks.trim()) {
        return {
          allowed: false,
          error: 'Mandatory requirement: Resubmission notes detailing corrections made are required.',
        };
      }
      return { allowed: true };
    }

    return {
      allowed: false,
      error: `Unauthorized: Students cannot transition request from '${currentStatus}' to '${targetStatus}'.`,
    };
  }

  return { allowed: false, error: 'Unauthorized role.' };
}

/**
 * Returns available user actions based on current status and user role.
 */
export function getPermittedWorkflowActions(
  currentStatus: RequestStatus | string,
  role: UserRole | 'admin' | 'incharge' | 'proctor' | 'student',
  isAssignedProctor: boolean = true
): string[] {
  if (isTerminalStatus(currentStatus)) {
    return [];
  }

  const actions: string[] = [];

  if (role === 'proctor' && isAssignedProctor) {
    if (
      currentStatus === 'submitted' ||
      currentStatus === 'pending_proctor' ||
      currentStatus === 'pending_faculty'
    ) {
      actions.push('recommend', 'recommend_reject', 'return_for_correction');
    }
  }

  if (role === 'incharge' || role === 'admin') {
    if (
      currentStatus === 'recommended_by_proctor' ||
      currentStatus === 'rejected_by_proctor' ||
      currentStatus === 'pending_incharge' ||
      currentStatus === 'pending_admin'
    ) {
      actions.push('approve', 'reject', 'return_for_correction');
    }
  }

  if (role === 'student') {
    if (currentStatus === 'returned_for_correction') {
      actions.push('resubmit', 'withdraw');
    } else {
      actions.push('withdraw');
    }
  }

  return actions;
}
