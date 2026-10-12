import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import insforge from '@/lib/insforge';
import { ParticipationRequest, AcademicAttendanceRecord, ProctorAssignment, TechnicalEvent } from '@/types';
import { 
  FileText, 
  UserCheck, 
  GraduationCap, 
  Plus, 
  Eye, 
  AlertTriangle, 
  History, 
  CheckCircle2, 
  FileCheck2, 
  MessageSquare, 
  ShieldCheck,
  Edit3,
  RotateCcw
} from 'lucide-react';
import Badge from '@/components/common/Badge';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { evaluateEligibility } from '@/utils/eligibility';
import DocumentViewerModal from '@/components/common/DocumentViewerModal';
import OdRequestModal from '@/components/requests/OdRequestModal';
import DecisionHistoryModal from '@/components/requests/DecisionHistoryModal';
import ResubmitModal from '@/components/requests/ResubmitModal';

interface StudentDashboardProps {
  initialEvent?: TechnicalEvent | null;
  onNavigateToEvents: () => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ 
  initialEvent,
  onNavigateToEvents 
}) => {
  const { user, profile } = useAuth();
  const [requests, setRequests] = useState<ParticipationRequest[]>([]);
  const [attendance, setAttendance] = useState<AcademicAttendanceRecord | null>(null);
  const [proctorAssignment, setProctorAssignment] = useState<ProctorAssignment | null>(null);
  const [loading, setLoading] = useState(true);

  // Modals & Action States
  const [viewerKey, setViewerKey] = useState<string | null>(null);
  const [showApplyModal, setShowApplyModal] = useState<boolean>(!!initialEvent);
  const [selectedEventForModal, setSelectedEventForModal] = useState<TechnicalEvent | null>(initialEvent || null);
  const [selectedAuditRequest, setSelectedAuditRequest] = useState<ParticipationRequest | null>(null);
  const [selectedResubmitRequest, setSelectedResubmitRequest] = useState<ParticipationRequest | null>(null);
  const [withdrawLoading, setWithdrawLoading] = useState<string | null>(null);

  useEffect(() => {
    if (initialEvent) {
      setSelectedEventForModal(initialEvent);
      setShowApplyModal(true);
    }
  }, [initialEvent]);

  const loadStudentData = async () => {
    if (!user?.id) return;
    setLoading(true);

    try {
      // 1. Fetch Student's Participation Requests
      const { data: reqData } = await insforge.database
        .from('participation_requests')
        .select('*, event:events(*)')
        .eq('student_id', user.id)
        .order('created_at', { ascending: false });

      setRequests((reqData as ParticipationRequest[]) || []);

      // 2. Fetch Latest Accepted Attendance Snapshot from latest completed import
      if (profile?.roll_number) {
        const { data: attData } = await insforge.database
          .from('academic_attendance_records')
          .select('*, import:academic_attendance_imports!import_id(*)')
          .eq('roll_number', profile.roll_number)
          .order('source_date', { ascending: false })
          .limit(1);

        if (attData && attData.length > 0) {
          setAttendance(attData[0] as AcademicAttendanceRecord);
        }
      }

      // 3. Fetch Assigned Proctor
      const { data: proctorData } = await insforge.database
        .from('proctor_assignments')
        .select('*, proctor:profiles!proctor_id(*)')
        .eq('student_id', user.id)
        .eq('is_active', true)
        .limit(1);

      if (proctorData && proctorData.length > 0) {
        setProctorAssignment(proctorData[0] as ProctorAssignment);
      }
    } catch (err) {
      console.error('[StudentDashboard] Error loading student records:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudentData();
  }, [user?.id, profile?.roll_number]);

  const handleWithdraw = async (requestId: string) => {
    if (!window.confirm('Are you sure you want to withdraw this OD application? This action is permanent.')) {
      return;
    }
    setWithdrawLoading(requestId);
    try {
      const { error: rpcErr } = await insforge.database.rpc('process_request_workflow_action', {
        p_request_id: requestId,
        p_action: 'student_withdraw',
        p_remarks: 'Withdrawn by student.',
      });

      if (rpcErr) {
        console.warn('[StudentDashboard] Withdraw RPC fallback:', rpcErr);
        const { error: updateErr } = await insforge.database
          .from('participation_requests')
          .update({
            status: 'withdrawn',
            updated_at: new Date().toISOString(),
          })
          .eq('id', requestId);

        if (updateErr) throw new Error(updateErr.message);

        await insforge.database.from('request_decision_history').insert([
          {
            request_id: requestId,
            actor_id: user?.id,
            actor_name: profile?.name || 'Student',
            actor_role: 'student',
            new_status: 'withdrawn',
            action_type: 'withdrawn',
            remarks: 'Withdrawn by student.',
          },
        ]);
      }

      await loadStudentData();
    } catch (err: any) {
      alert(`Withdrawal failed: ${err.message}`);
    } finally {
      setWithdrawLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="py-24">
        <LoadingSpinner size="lg" label="Synchronizing student records and OD requests..." />
      </div>
    );
  }

  const currentEligibility = evaluateEligibility(attendance);

  return (
    <div className="space-y-8 py-6">
      {/* Student Profile Header */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <GraduationCap className="w-3.5 h-3.5" />
            Verified Student Profile
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            {profile?.name || user?.email}
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
            <span>Roll No: <strong className="text-slate-200">{profile?.roll_number || 'Pending'}</strong></span>
            <span>&bull;</span>
            <span>Dept: <strong className="text-slate-200">{profile?.department}</strong></span>
            <span>&bull;</span>
            <span>Email: <strong className="text-slate-200">{profile?.email}</strong></span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setSelectedEventForModal(null);
              setShowApplyModal(true);
            }}
            className="px-5 py-3 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            Apply for New OD
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Attendance Eligibility Card */}
        <div className="glass-card rounded-2xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400">Current Academic Eligibility</span>
            <Badge status={currentEligibility.status} size="sm" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-white">
              {currentEligibility.percentage !== null ? `${currentEligibility.percentage}%` : 'Unavailable'}
            </span>
            <span className="text-xs text-slate-400">
              (Min Required: {currentEligibility.threshold}%)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-2 font-medium">
            {currentEligibility.message}
          </p>
          {attendance && (
            <p className="text-[11px] text-slate-500 mt-1">
              Classes: {attendance.classes_attended} / {attendance.classes_conducted} &bull; Recorded on {attendance.source_date}
            </p>
          )}
        </div>

        {/* Proctor Mentor Card */}
        <div className="glass-card rounded-2xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400">Assigned Proctor</span>
            <UserCheck className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-lg font-bold text-white truncate">
            {proctorAssignment?.proctor?.name || 'Department Academic Mentor'}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {proctorAssignment?.proctor?.email || 'Reviews and endorses OD requests before In-Charge finalization.'}
          </p>
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
            <ShieldCheck className="w-3.5 h-3.5" />
            RLS Proctor Authorization Active
          </div>
        </div>

        {/* Requests Count Card */}
        <div className="glass-card rounded-2xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400">My OD Applications</span>
            <FileText className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-3xl font-extrabold text-white">
            {requests.length}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {requests.filter(r => r.status === 'approved' || r.status === 'approved_by_incharge').length} Approved &bull; {requests.filter(r => r.status.includes('pending') || r.status === 'submitted' || r.status.includes('recommended')).length} In Review &bull; {requests.filter(r => r.status === 'draft').length} Drafts
          </p>
        </div>
      </div>

      {/* OD Requests List */}
      <div className="glass-panel rounded-2xl p-6 sm:p-8 border border-slate-800">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <History className="w-5 h-5 text-indigo-400" />
              My OD Requests & Participation Vault
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Tracks multi-stage approval workflow with immutable submission-time attendance snapshots.
            </p>
          </div>
          <span className="text-xs text-slate-500 font-mono hidden sm:inline">PostgreSQL RLS Hardened</span>
        </div>

        {requests.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-400 font-medium">No participation requests submitted yet.</p>
            <p className="text-xs text-slate-500 mt-1">Select an accredited event to request On-Duty (OD) approval.</p>
            <button
              onClick={onNavigateToEvents}
              className="mt-4 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white inline-flex items-center gap-1.5"
            >
              Browse Technical Events
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {requests.map((req: any) => {
              const isTerminal =
                req.status === 'approved_by_incharge' ||
                req.status === 'rejected_by_incharge' ||
                req.status === 'withdrawn';
              const isReturned = req.status === 'returned_for_correction';

              return (
                <div key={req.id} className="py-5 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                  <div className="space-y-2.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="font-mono text-xs font-bold text-indigo-300 bg-indigo-950/60 px-2 py-0.5 rounded border border-indigo-800/40">
                        {req.request_reference || `OD-${req.id.substring(0, 8)}`}
                      </span>
                      <h3 className="text-base font-bold text-white">
                        {req.event?.title || 'External Technical Event'}
                      </h3>
                      <Badge status={req.status} size="sm" />
                      {req.resubmission_count && req.resubmission_count > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/10 text-purple-400 border border-purple-500/30">
                          Resubmission #{req.resubmission_count}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                      <span>Role: <strong className="text-slate-200">{req.event_role}</strong></span>
                      <span>&bull;</span>
                      <span>
                        Dates: <strong className="text-slate-200">{req.od_start_date || 'N/A'}</strong> to <strong className="text-slate-200">{req.od_end_date || 'N/A'}</strong> ({req.od_days_requested} Days)
                      </span>
                      <span>&bull;</span>
                      <span>Submitted on: {new Date(req.created_at).toLocaleDateString()}</span>
                    </div>

                    {/* Correction Notice Banner */}
                    {isReturned && (
                      <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
                        <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                        <div className="space-y-1">
                          <div className="font-bold text-amber-200">
                            Action Required: Application Returned for Correction
                          </div>
                          <p className="text-amber-300/90 leading-relaxed font-medium">
                            {req.admin_remarks || req.faculty_remarks || 'Please update your application details and resubmit for review.'}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Submission Snapshot */}
                    <div className="flex flex-wrap items-center gap-3 p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] text-slate-400">
                      <span className="font-semibold text-slate-300 flex items-center gap-1">
                        <FileCheck2 className="w-3.5 h-3.5 text-indigo-400" />
                        Submission Snapshot:
                      </span>
                      <span>
                        Attendance: <strong className="text-white">{req.submission_attendance_percentage !== null && req.submission_attendance_percentage !== undefined ? `${req.submission_attendance_percentage}%` : 'Unavailable'}</strong>
                      </span>
                      <span>&bull;</span>
                      <span>
                        Result: <strong className="text-indigo-300 uppercase">{req.submission_eligibility_status || 'Pending'}</strong>
                      </span>
                      <span>&bull;</span>
                      <span>Threshold Applied: {req.submission_threshold_applied || 75}%</span>
                    </div>

                    {/* Proctor Remarks */}
                    {req.faculty_remarks && !isReturned && (
                      <div className="text-xs text-sky-400/90 italic bg-sky-950/30 px-3 py-1.5 rounded-lg border border-sky-800/40 inline-flex items-center gap-2">
                        <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                        <span>Proctor Endorsement: &quot;{req.faculty_remarks}&quot;</span>
                      </div>
                    )}

                    {/* In-Charge Remarks */}
                    {req.admin_remarks && !isReturned && (
                      <div className="text-xs text-indigo-400/90 italic bg-indigo-950/30 px-3 py-1.5 rounded-lg border border-indigo-800/40 inline-flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                        <span>In-Charge Decision: &quot;{req.admin_remarks}&quot;</span>
                      </div>
                    )}
                  </div>

                  {/* Actions Bar */}
                  <div className="flex flex-wrap items-center gap-2 shrink-0 self-end lg:self-center">
                    {/* View Vault Proof */}
                    {req.proof_document_key ? (
                      <button
                        onClick={() => setViewerKey(req.proof_document_key)}
                        className="px-3 py-2 rounded-xl text-xs font-semibold bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5 transition-all"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Vault Proof
                      </button>
                    ) : (
                      <span className="text-xs text-amber-400 flex items-center gap-1 bg-amber-500/10 px-2.5 py-1.5 rounded-xl border border-amber-500/20">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Proof Pending
                      </span>
                    )}

                    {/* Audit History Timeline */}
                    <button
                      onClick={() => setSelectedAuditRequest(req)}
                      className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-all"
                    >
                      <History className="w-3.5 h-3.5 text-indigo-400" />
                      Audit Trail
                    </button>

                    {/* Edit & Resubmit (When returned for correction) */}
                    {isReturned && (
                      <button
                        onClick={() => setSelectedResubmitRequest(req)}
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 shadow-md shadow-amber-600/30 transition-all active:scale-95"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit & Resubmit
                      </button>
                    )}

                    {/* Withdraw (When not yet finalized) */}
                    {!isTerminal && (
                      <button
                        onClick={() => handleWithdraw(req.id)}
                        disabled={withdrawLoading === req.id}
                        className="px-3 py-2 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
                        title="Withdraw this request"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        {withdrawLoading === req.id ? 'Withdrawing...' : 'Withdraw'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Document Vault Viewer Modal */}
      {viewerKey && (
        <DocumentViewerModal
          objectKey={viewerKey}
          title="Student Proof Document"
          onClose={() => setViewerKey(null)}
        />
      )}

      {/* New OD Application Modal */}
      {showApplyModal && (
        <OdRequestModal
          initialEvent={selectedEventForModal}
          onClose={() => setShowApplyModal(false)}
          onSuccess={() => {
            setShowApplyModal(false);
            loadStudentData();
          }}
        />
      )}

      {/* Decision Audit History Modal */}
      {selectedAuditRequest && (
        <DecisionHistoryModal
          request={selectedAuditRequest}
          onClose={() => setSelectedAuditRequest(null)}
        />
      )}

      {/* Resubmit Modal */}
      {selectedResubmitRequest && (
        <ResubmitModal
          request={selectedResubmitRequest}
          onClose={() => setSelectedResubmitRequest(null)}
          onSuccess={() => {
            setSelectedResubmitRequest(null);
            loadStudentData();
          }}
        />
      )}
    </div>
  );
};

export default StudentDashboard;
