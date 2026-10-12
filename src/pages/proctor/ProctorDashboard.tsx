import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import insforge from '@/lib/insforge';
import { ParticipationRequest } from '@/types';
import { 
  UserCheck, 
  Users, 
  CheckCircle2, 
  XCircle, 
  MessageSquare, 
  Eye,
  History,
  AlertTriangle
} from 'lucide-react';
import Badge from '@/components/common/Badge';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import DocumentViewerModal from '@/components/common/DocumentViewerModal';
import DecisionHistoryModal from '@/components/requests/DecisionHistoryModal';

export const ProctorDashboard: React.FC = () => {
  const { user, profile } = useAuth();
  const [requests, setRequests] = useState<ParticipationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'reviewed'>('pending');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [viewerKey, setViewerKey] = useState<string | null>(null);
  const [selectedAuditRequest, setSelectedAuditRequest] = useState<ParticipationRequest | null>(null);
  const [remarksError, setRemarksError] = useState<string | null>(null);

  const [remarksModal, setRemarksModal] = useState<{
    requestId: string;
    studentName: string;
    requestRef: string;
    action: 'recommend' | 'reject' | 'changes';
    remarks: string;
  } | null>(null);

  const fetchProctorQueue = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      // Due to RLS policy, only assigned students' requests will be returned
      const { data, error } = await insforge.database
        .from('participation_requests')
        .select('*, event:events(*)')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[ProctorDashboard] Query error:', error);
      } else {
        setRequests((data as ParticipationRequest[]) || []);
      }
    } catch (err) {
      console.error('[ProctorDashboard] Exception:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProctorQueue();
  }, [user?.id]);

  const handleActionSubmit = async () => {
    if (!remarksModal || !user?.id) return;
    const { requestId, action, remarks } = remarksModal;
    setRemarksError(null);

    // Rejection and corrections strictly require remarks
    if ((action === 'reject' || action === 'changes') && (!remarks || !remarks.trim())) {
      setRemarksError(
        action === 'reject'
          ? 'Mandatory: Please provide a reason for the rejection recommendation.'
          : 'Mandatory: Please provide clear, actionable instructions for the student.'
      );
      return;
    }

    setActionLoading(requestId);

    const actionType =
      action === 'recommend'
        ? 'proctor_recommend'
        : action === 'reject'
        ? 'proctor_reject'
        : 'proctor_return';

    try {
      // Try atomic stored function first
      const { error: rpcErr } = await insforge.database.rpc(
        'process_request_workflow_action',
        {
          p_request_id: requestId,
          p_action: actionType,
          p_remarks: remarks.trim() || (action === 'recommend' ? 'Recommended by faculty proctor.' : null),
        }
      );

      if (rpcErr) {
        console.warn('[ProctorDashboard] RPC failed, applying direct table update fallback:', rpcErr);

        const newStatus =
          action === 'recommend'
            ? 'recommended_by_proctor'
            : action === 'reject'
            ? 'rejected_by_proctor'
            : 'returned_for_correction';

        // 1. Update Participation Request directly
        const { error: updateErr } = await insforge.database
          .from('participation_requests')
          .update({
            status: newStatus,
            faculty_reviewer_id: user.id,
            faculty_reviewer_name: profile?.name || 'Proctor',
            faculty_remarks: remarks.trim() || null,
            proctor_reviewed_at: new Date().toISOString(),
          })
          .eq('id', requestId);

        if (updateErr) {
          throw new Error(`Direct update failed: ${updateErr.message}`);
        }

        // 2. Insert Decision History
        await insforge.database
          .from('request_decision_history')
          .insert([
            {
              request_id: requestId,
              actor_id: user.id,
              actor_name: profile?.name || 'Proctor',
              actor_role: 'proctor',
              new_status: newStatus,
              remarks: remarks.trim() || null,
            },
          ]);
      }

      setRemarksModal(null);
      await fetchProctorQueue();
    } catch (err: any) {
      alert(`Error updating request: ${err?.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="py-24">
        <LoadingSpinner size="lg" label="Loading assigned student requests & audit logs..." />
      </div>
    );
  }

  const pendingRequests = requests.filter(
    (r) => r.status === 'submitted' || r.status === 'pending_proctor' || r.status === 'pending_faculty'
  );

  const reviewedRequests = requests.filter(
    (r) => r.status !== 'submitted' && r.status !== 'pending_proctor' && r.status !== 'pending_faculty' && r.status !== 'draft'
  );

  const displayedRequests = activeTab === 'pending' ? pendingRequests : reviewedRequests;

  return (
    <div className="space-y-8 py-6">
      {/* Header */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/30 mb-2">
            <UserCheck className="w-3.5 h-3.5" />
            Faculty Advisor & Proctor Workspace
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            Assigned Mentee Review Queue
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Enforced by PostgreSQL RLS: You can view, inspect vault proofs, and endorse applications strictly from your assigned student pool.
          </p>
        </div>

        {/* Tab Switcher & Metrics */}
        <div className="flex items-center gap-3">
          <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-800">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'pending'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Pending ({pendingRequests.length})
            </button>
            <button
              onClick={() => setActiveTab('reviewed')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'reviewed'
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Reviewed History ({reviewedRequests.length})
            </button>
          </div>
        </div>
      </div>

      {/* Review Queue */}
      <div className="glass-panel rounded-2xl p-6 border border-slate-800">
        <h2 className="text-lg font-bold text-white mb-6">
          {activeTab === 'pending' ? 'Applications Awaiting Your Endorsement' : 'Previously Reviewed Applications'}
        </h2>

        {displayedRequests.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400 font-medium">
              {activeTab === 'pending'
                ? 'All mentee participation requests have been reviewed.'
                : 'No historical reviewed applications on record.'}
            </p>
            <p className="text-xs text-slate-500 mt-1">
              New submissions from your assigned mentees will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayedRequests.map((req) => (
              <div
                key={req.id}
                className="glass-card rounded-2xl p-5 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-6"
              >
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="text-base font-bold text-white">
                      {req.student_name}
                    </h3>
                    <span className="text-xs font-mono text-slate-400">({req.roll_number})</span>
                    <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 font-mono text-[11px] font-bold border border-indigo-500/20">
                      {req.request_reference || 'OD-REF'}
                    </span>
                    <Badge status={req.status} size="sm" />
                  </div>

                  <p className="text-xs text-slate-300">
                    Applying for: <strong className="text-white">{req.event?.title || 'Technical Event'}</strong> ({req.event?.category})
                    {req.event_role && <span> &bull; Role: <strong className="text-slate-200">{req.event_role}</strong></span>}
                  </p>

                  <p className="text-xs text-slate-400 max-w-2xl bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                    <span className="font-semibold text-slate-300">Purpose Statement: </span>
                    {req.reason_statement}
                  </p>

                  {/* Attendance Snapshot Information */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 pt-1">
                    <div className="flex items-center gap-1.5">
                      <span>Attendance Snapshot:</span>
                      <strong className="text-white">
                        {req.submission_attendance_percentage !== null && req.submission_attendance_percentage !== undefined
                          ? `${req.submission_attendance_percentage}%`
                          : 'Unavailable'}
                      </strong>
                      <span className="text-[11px] text-slate-500">
                        ({req.submission_eligibility_status || 'N/A'}, threshold: {req.submission_threshold_applied ?? 75}%)
                      </span>
                    </div>

                    <span>&bull;</span>

                    {req.od_start_date && (
                      <span>
                        Dates: <strong className="text-slate-300">{req.od_start_date} to {req.od_end_date}</strong> ({req.od_days_requested} days)
                      </span>
                    )}

                    <span>&bull;</span>
                    <span>Dept: <strong className="text-slate-300">{req.department}</strong></span>
                  </div>

                  {/* Prior Remarks if present */}
                  {req.faculty_remarks && (
                    <p className="text-xs text-sky-400 bg-sky-950/30 p-2 rounded-lg border border-sky-800/30 max-w-2xl">
                      <strong>Your Endorsement Notes: </strong>&quot;{req.faculty_remarks}&quot;
                    </p>
                  )}
                  {req.admin_remarks && (
                    <p className="text-xs text-indigo-400 bg-indigo-950/30 p-2 rounded-lg border border-indigo-800/30 max-w-2xl">
                      <strong>In-Charge Admin Remarks: </strong>&quot;{req.admin_remarks}&quot;
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2 lg:self-center shrink-0">
                  {/* Proof Document Viewer */}
                  {(req.proof_document_key || req.proof_document_url) && (
                    <button
                      onClick={() => setViewerKey(req.proof_document_key || req.proof_document_url || null)}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5 transition-all"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Vault Proof
                    </button>
                  )}

                  {/* Audit History Timeline */}
                  <button
                    onClick={() => setSelectedAuditRequest(req)}
                    className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 flex items-center gap-1.5 transition-all"
                  >
                    <History className="w-3.5 h-3.5 text-indigo-400" />
                    Audit Trail
                  </button>

                  {/* Action buttons (only enabled for pending requests) */}
                  {(req.status === 'submitted' || req.status === 'pending_proctor' || req.status === 'pending_faculty') && (
                    <>
                      <button
                        onClick={() =>
                          setRemarksModal({
                            requestId: req.id,
                            studentName: req.student_name,
                            requestRef: req.request_reference || 'OD-REF',
                            action: 'recommend',
                            remarks: 'Satisfactory academic attendance. Recommended for final OD approval.',
                          })
                        }
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                        Recommend
                      </button>

                      <button
                        onClick={() =>
                          setRemarksModal({
                            requestId: req.id,
                            studentName: req.student_name,
                            requestRef: req.request_reference || 'OD-REF',
                            action: 'changes',
                            remarks: '',
                          })
                        }
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 active:scale-95"
                      >
                        <MessageSquare className="w-4 h-4" />
                        Return
                      </button>

                      <button
                        onClick={() =>
                          setRemarksModal({
                            requestId: req.id,
                            studentName: req.student_name,
                            requestRef: req.request_reference || 'OD-REF',
                            action: 'reject',
                            remarks: '',
                          })
                        }
                        className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 flex items-center gap-1.5 active:scale-95"
                      >
                        <XCircle className="w-4 h-4" />
                        Reject
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Remarks Confirmation Modal */}
      {remarksModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="glass-panel rounded-3xl p-6 max-w-md w-full border border-slate-700 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">
              {remarksModal.action === 'recommend'
                ? 'Recommend OD Application'
                : remarksModal.action === 'reject'
                ? 'Recommend Rejection'
                : 'Return Application for Correction'}
            </h3>
            <p className="text-xs text-slate-400 mb-3">
              Application <strong className="text-white">{remarksModal.requestRef}</strong> for {remarksModal.studentName}.
              Recorded permanently into the immutable audit trail.
            </p>

            {remarksError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{remarksError}</span>
              </div>
            )}

            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Reviewer Notes / Instructions{' '}
              {remarksModal.action !== 'recommend' && <span className="text-rose-400">* (Required)</span>}
            </label>
            <textarea
              rows={4}
              value={remarksModal.remarks}
              onChange={(e) => {
                setRemarksModal({ ...remarksModal, remarks: e.target.value });
                if (remarksError) setRemarksError(null);
              }}
              className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 mb-4"
              placeholder={
                remarksModal.action === 'recommend'
                  ? 'Add mentor endorsement remarks (optional)...'
                  : remarksModal.action === 'reject'
                  ? 'Specify reason for recommending rejection (mandatory)...'
                  : 'Detail required corrections for student (mandatory)...'
              }
            />

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setRemarksModal(null);
                  setRemarksError(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleActionSubmit}
                disabled={actionLoading !== null}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-2 ${
                  remarksModal.action === 'recommend'
                    ? 'bg-emerald-600 hover:bg-emerald-500'
                    : remarksModal.action === 'reject'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-amber-600 hover:bg-amber-500'
                }`}
              >
                {actionLoading ? 'Recording...' : 'Submit Review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Vault Viewer Modal */}
      {viewerKey && (
        <DocumentViewerModal
          objectKey={viewerKey}
          title="Student Proof Document"
          onClose={() => setViewerKey(null)}
        />
      )}

      {/* Decision Audit History Modal */}
      {selectedAuditRequest && (
        <DecisionHistoryModal
          request={selectedAuditRequest}
          onClose={() => setSelectedAuditRequest(null)}
        />
      )}
    </div>
  );
};

export default ProctorDashboard;
