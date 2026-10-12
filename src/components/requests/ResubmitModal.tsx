import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import insforge from '@/lib/insforge';
import { ParticipationRequest } from '@/types';
import { 
  X, 
  Upload, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw,
  MessageSquare
} from 'lucide-react';
import { validateProofDocument, uploadStudentProof } from '@/utils/documentVault';

interface ResubmitModalProps {
  request: ParticipationRequest;
  onClose: () => void;
  onSuccess: () => void;
}

export const ResubmitModal: React.FC<ResubmitModalProps> = ({
  request,
  onClose,
  onSuccess,
}) => {
  const { user, profile } = useAuth();
  const [reasonStatement, setReasonStatement] = useState<string>(request.reason_statement || '');
  const [eventRole, setEventRole] = useState<string>(request.event_role || 'Participant');
  const [teamName, setTeamName] = useState<string>(request.team_name || '');
  const [startDate, setStartDate] = useState<string>(request.od_start_date || '');
  const [endDate, setEndDate] = useState<string>(request.od_end_date || '');
  const [resubmitRemarks, setResubmitRemarks] = useState<string>('');

  // Replacement Proof Document
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploadedProofKey, setUploadedProofKey] = useState<string>(request.proof_document_key || '');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const validation = validateProofDocument(file);
      if (!validation.valid) {
        setErrorMessage(validation.error || 'Invalid file.');
        setProofFile(null);
        return;
      }
      setErrorMessage(null);
      setProofFile(file);
    }
  };

  const handleResubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    if (!resubmitRemarks.trim()) {
      setErrorMessage('Please describe the corrections made in response to reviewer remarks.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    let activeProofKey = uploadedProofKey;

    try {
      // 1. Upload new proof if provided
      if (proofFile) {
        setIsUploading(true);
        const uploadRes = await uploadStudentProof(proofFile, user.id);
        setIsUploading(false);

        if (uploadRes.error || !uploadRes.key) {
          throw new Error(uploadRes.error || 'Failed to upload replacement proof document.');
        }
        activeProofKey = uploadRes.key;
        setUploadedProofKey(activeProofKey);
      }

      // 2. Prepare updated fields
      const updatedFields: Record<string, any> = {
        reason_statement: reasonStatement,
        event_role: eventRole,
        team_name: teamName || null,
        od_start_date: startDate || null,
        od_end_date: endDate || null,
        proof_document_key: activeProofKey || null,
      };

      // 3. Call atomic workflow RPC
      const { error: rpcErr } = await insforge.database.rpc('process_request_workflow_action', {
        p_request_id: request.id,
        p_action: 'student_resubmit',
        p_remarks: resubmitRemarks.trim(),
        p_updated_fields: updatedFields,
      });

      if (rpcErr) {
        console.warn('[ResubmitModal] RPC failed, falling back to direct update:', rpcErr);
        const nextResubmissionCount = (request.resubmission_count || 0) + 1;
        const { error: updateErr } = await insforge.database
          .from('participation_requests')
          .update({
            ...updatedFields,
            status: 'pending_proctor',
            resubmission_count: nextResubmissionCount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', request.id);

        if (updateErr) throw new Error(updateErr.message);

        // Record history
        await insforge.database.from('request_decision_history').insert([
          {
            request_id: request.id,
            actor_id: user.id,
            actor_name: profile?.name || user.email || 'Student',
            actor_role: 'student',
            new_status: 'pending_proctor',
            action_type: 'resubmitted',
            remarks: resubmitRemarks.trim(),
          },
        ]);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[ResubmitModal] Resubmission error:', err);
      setErrorMessage(err.message || 'Failed to resubmit request.');
    } finally {
      setIsSubmitting(false);
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass-panel rounded-3xl max-w-xl w-full max-h-[92vh] flex flex-col border border-slate-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 sm:px-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <RefreshCw className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Correct & Resubmit OD Application
              </h2>
              <p className="text-xs text-slate-400">
                Application <span className="font-mono text-indigo-400 font-semibold">{request.request_reference || 'OD-REF'}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleResubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5">
          {/* Reviewer Feedback Box */}
          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
              <MessageSquare className="w-4 h-4" />
              <span>Reviewer Correction Instructions:</span>
            </div>
            <p className="text-xs text-amber-200/90 leading-relaxed font-medium pl-6">
              {request.admin_remarks || request.faculty_remarks || 'Please update your application details and supporting documents as instructed by the reviewer.'}
            </p>
          </div>

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Resubmission Correction Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Correction Summary / Notes for Reviewer <span className="text-rose-400">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={resubmitRemarks}
              onChange={(e) => setResubmitRemarks(e.target.value)}
              placeholder="Detail what changes you made in response to the reviewer feedback..."
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Reason / Statement */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Purpose / Statement of Participation
            </label>
            <textarea
              rows={3}
              value={reasonStatement}
              onChange={(e) => setReasonStatement(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Role & Team */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Participation Role
              </label>
              <input
                type="text"
                value={eventRole}
                onChange={(e) => setEventRole(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Team Name
              </label>
              <input
                type="text"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                OD Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                OD End Date
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Proof Document Replacement */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Replace Supporting Proof in Document Vault (Optional)
            </label>
            <div className="p-4 rounded-xl border border-dashed border-slate-700 bg-slate-900/40 text-center">
              <input
                type="file"
                id="resubmit-proof"
                onChange={handleFileChange}
                accept=".pdf,.png,.jpg,.jpeg,.webp"
                className="hidden"
              />
              <label
                htmlFor="resubmit-proof"
                className="cursor-pointer inline-flex flex-col items-center gap-1.5 text-xs text-slate-400 hover:text-white"
              >
                <Upload className="w-5 h-5 text-indigo-400" />
                <span className="font-semibold text-indigo-300">
                  {proofFile ? proofFile.name : 'Choose updated proof document (PDF, PNG, JPG)'}
                </span>
                <span className="text-[10px] text-slate-500">Max size: 5MB &bull; Secure vault storage</span>
              </label>
            </div>
          </div>

          {/* Submit Actions */}
          <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isUploading}
              className="px-5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-2 shadow-lg shadow-amber-600/30 active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Resubmitting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Resubmit for Proctor Review
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ResubmitModal;
