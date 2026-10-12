export type UserRole = 'student' | 'proctor' | 'incharge' | 'faculty' | 'admin';

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  department: string;
  roll_number?: string | null;
  year_of_study?: number | null;
  phone?: string | null;
  avatar_url?: string | null;
  created_at?: string;
}

export type EventCategory = 
  | 'Hackathon' 
  | 'Workshop' 
  | 'Conference' 
  | 'Coding Contest' 
  | 'Webathon' 
  | 'Symposium';

export type EventMode = 'In-Person' | 'Online' | 'Hybrid';

export type EventStatus = 'Upcoming' | 'Ongoing' | 'Completed' | 'Cancelled';

export interface TechnicalEvent {
  id: string;
  title: string;
  description: string;
  category: EventCategory;
  organizer_name: string;
  organizer_email?: string | null;
  venue: string;
  event_mode: EventMode;
  start_date: string;
  end_date: string;
  registration_deadline?: string | null;
  max_participants: number;
  banner_url?: string | null;
  brochure_url?: string | null;
  status: EventStatus;
  requires_od_approval: boolean;
  created_by?: string | null;
  created_at: string;
}

export type RequestStatus =
  | 'draft'
  | 'submitted'
  | 'pending_proctor'
  | 'recommended_by_proctor'
  | 'rejected_by_proctor'
  | 'pending_incharge'
  | 'approved_by_incharge'
  | 'rejected_by_incharge'
  | 'returned_for_correction'
  | 'withdrawn'
  | 'pending_faculty'
  | 'approved_faculty'
  | 'pending_admin'
  | 'approved'
  | 'rejected'
  | 'changes_requested';

export type EligibilityStatus = 
  | 'pending_check' 
  | 'eligible' 
  | 'conditionally_eligible' 
  | 'ineligible' 
  | 'stale_data' 
  | 'missing_data';

export interface ParticipationRequest {
  id: string;
  event_id: string;
  student_id: string;
  student_name: string;
  student_email: string;
  roll_number: string;
  department: string;
  reason_statement: string;
  event_role: string;
  team_name?: string | null;
  team_members?: string[] | null;
  proof_document_url?: string | null;
  proof_document_key?: string | null;
  supporting_document_url?: string | null;
  certificate_url?: string | null;
  status: RequestStatus;
  current_attendance_percentage?: number | null;
  eligibility_status?: EligibilityStatus;
  faculty_reviewer_id?: string | null;
  faculty_reviewer_name?: string | null;
  faculty_remarks?: string | null;
  faculty_reviewed_at?: string | null;
  admin_reviewer_id?: string | null;
  admin_remarks?: string | null;
  admin_reviewed_at?: string | null;
  proctor_id?: string | null;
  proctor_recommendation?: string | null;
  proctor_reviewed_at?: string | null;
  incharge_id?: string | null;
  incharge_decision?: string | null;
  incharge_reviewed_at?: string | null;
  resubmission_count: number;
  od_days_requested: number;
  request_reference?: string | null;
  event_website_url?: string | null;
  event_city?: string | null;
  od_start_date?: string | null;
  od_end_date?: string | null;
  submission_attendance_percentage?: number | null;
  submission_eligibility_status?: string | null;
  submission_threshold_applied?: number | null;
  submission_source_date?: string | null;
  submission_import_id?: string | null;
  submission_checked_at?: string | null;
  created_at: string;
  updated_at: string;
  // Joined relation fields
  event?: TechnicalEvent;
}

export interface RequestDecisionHistory {
  id: string;
  request_id: string;
  actor_id: string;
  actor_name: string;
  actor_role: string;
  previous_status?: string | null;
  new_status: string;
  remarks?: string | null;
  created_at: string;
}

export interface ProctorAssignment {
  id: string;
  proctor_id: string;
  student_id: string;
  academic_year?: number | null;
  department: string;
  is_active: boolean;
  assigned_at: string;
  proctor?: UserProfile;
  student?: UserProfile;
}

export interface AcademicAttendanceImport {
  id: string;
  importer_id: string;
  import_timestamp: string;
  source_date: string;
  filename: string;
  total_rows: number;
  valid_count: number;
  invalid_count: number;
  status: 'processing' | 'completed' | 'failed' | 'rejected';
  notes?: string | null;
  created_at: string;
}

export interface AcademicAttendanceRecord {
  id: string;
  import_id: string;
  student_id?: string | null;
  roll_number: string;
  student_name?: string | null;
  classes_conducted: number;
  classes_attended: number;
  attendance_percentage: number;
  source_date: string;
  validation_status: 'valid' | 'invalid' | 'duplicate' | 'unmatched_student';
  row_error?: string | null;
  created_at: string;
}

export interface InstitutionSettings {
  id: string;
  min_attendance_threshold: number;
  attendance_freshness_days: number;
  updated_by?: string | null;
  updated_at: string;
}

export interface AttendanceRecord {
  id: string;
  event_id: string;
  request_id?: string | null;
  student_id: string;
  session_name: string;
  check_in_time: string;
  verification_method: 'QR_SCAN' | 'MANUAL_FACULTY' | 'GEO_VERIFIED' | 'ADMIN_CHECKIN';
  verified_by?: string | null;
  status: 'Present' | 'Absent' | 'Late' | 'Excused';
  remarks?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  created_at: string;
}

export interface SystemNotification {
  id: string;
  recipient_id: string;
  title: string;
  message: string;
  type: 'info' | 'action_required' | 'approval' | 'warning' | 'error';
  link?: string | null;
  is_read: boolean;
  created_at: string;
}
