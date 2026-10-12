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
  Eye
} from 'lucide-react';
import Badge from '@/components/common/Badge';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import DocumentViewerModal from '@/components/common/DocumentViewerModal';

export const ProctorDashboard: React.FC = () => {
  const { user, profile } = useAuth();
  const [requests, setRequests] = useState<ParticipationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [viewerKey, setViewerKey] = useState<string | null>(null);
  const [remarksModal, setRemarksModal] = useState<{
    requestId: string;
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
    setActionLoading(requestId);

    const newStatus =
      action === 'recommend'
        ? 'recommended_by_proctor'
        : action === 'reject'
        ? 'rejected_by_proctor'
        : 'returned_for_correction';

    try {
      // 1. Update Participation Request
      const { error: updateErr } = await insforge.database
        .from('participation_requests')
        .update({
          status: newStatus,
          faculty_reviewer_id: user.id,
          faculty_reviewer_name: profile?.name || 'Proctor',
          faculty_remarks: remarks,
          faculty_reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (updateErr) {
        alert(`Update failed: ${updateErr.message}`);
        setActionLoading(null);
        return;
      }

      // 2. Insert Append-Only Decision History
      await insforge.database
        .from('request_decision_history')
        .insert([
          {
            request_id: requestId,
            actor_id: user.id,
            actor_name: profile?.name || 'Proctor',
            actor_role: 'proctor',
            new_status: newStatus,
            remarks: remarks || null,
          },
        ]);

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
            Assigned Student Review Queue
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Enforced by PostgreSQL RLS: You can view and endorse requests strictly from your assigned student mentee pool.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-center">
            <div className="text-xl font-extrabold text-amber-400">{pendingRequests.length}</div>
            <div className="text-[10px] uppercase font-semibold text-slate-500">Pending Review</div>
          </div>
          <div className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-center">
            <div className="text-xl font-extrabold text-indigo-400">{requests.length}</div>
            <div className="text-[10px] uppercase font-semibold text-slate-500">Total Assigned</div>
          </div>
        </div>
      </div>

      {/* Review Queue */}
      <div className="glass-panel rounded-2xl p-6 border border-slate-800">
        <h2 className="text-lg font-bold text-white mb-6">Pending Student OD Applications</h2>

        {requests.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400 font-medium">No participation requests in your assigned student pool.</p>
            <p className="text-xs text-slate-500 mt-1">New submissions from your assigned mentees will appear here automatically.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((req) => (
              <div
                key={req.id}
                className="glass-card rounded-2xl p-5 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-6"
              >
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-bold text-white">
                      {req.student_name}
                    </h3>
                    <span className="text-xs font-mono text-slate-400">({req.roll_number})</span>
                    <Badge status={req.status} size="sm" />
                  </div>

                  <p className="text-xs text-slate-300">
                    Applying for: <strong className="text-white">{req.event?.title || 'Technical Event'}</strong> ({req.event?.category})
                  </p>

                  <p className="text-xs text-slate-400 max-w-2xl bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/80">
                    <span className="font-semibold text-slate-300">Statement: </span>
                    {req.reason_statement}
                  </p>

                  <div className="flex items-center gap-4 text-xs text-slate-500 pt-1">
                    <span>Days: <strong className="text-slate-300">{req.od_days_requested}</strong></span>
                    <span>&bull;</span>
                    <span>Dept: <strong className="text-slate-300">{req.department}</strong></span>
                    <span>&bull;</span>
                    <span>Submitted: {new Date(req.created_at).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2 lg:self-center shrink-0">
                  {req.proof_document_key && (
                    <button
                      onClick={() => setViewerKey(req.proof_document_key || null)}
                      className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5 transition-all"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      View Vault Proof
                    </button>
                  )}

                  <button
                    onClick={() =>
                      setRemarksModal({
                        requestId: req.id,
                        action: 'recommend',
                        remarks: 'Student has satisfactory attendance. Recommended for OD approval.',
                      })
                    }
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Endorse / Recommend
                  </button>

                  <button
                    onClick={() =>
                      setRemarksModal({
                        requestId: req.id,
                        action: 'changes',
                        remarks: 'Please attach official brochure with verified dates.',
                      })
                    }
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-orange-600/80 hover:bg-orange-600 text-white flex items-center gap-1.5 active:scale-95"
                  >
                    <MessageSquare className="w-4 h-4" />
                    Request Changes
                  </button>

                  <button
                    onClick={() =>
                      setRemarksModal({
                        requestId: req.id,
                        action: 'reject',
                        remarks: 'Low attendance / academic conflict.',
                      })
                    }
                    className="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 flex items-center gap-1.5 active:scale-95"
                  >
                    <XCircle className="w-4 h-4" />
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Remarks Confirmation Modal */}
      {remarksModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="glass-panel rounded-3xl p-6 max-w-md w-full border border-slate-700 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-2">
              Proctor Feedback & Endorsement
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Add your official mentor notes. These remarks are stored permanently in the append-only audit trail.
            </p>

            <textarea
              rows={3}
              value={remarksModal.remarks}
              onChange={(e) =>
                setRemarksModal({ ...remarksModal, remarks: e.target.value })
              }
              className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 mb-4"
              placeholder="Enter remarks..."
            />

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setRemarksModal(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleActionSubmit}
                disabled={actionLoading !== null}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2"
              >
                {actionLoading ? 'Saving...' : 'Confirm Decision'}
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
    </div>
  );
};

export default ProctorDashboard;
