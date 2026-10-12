import React, { useEffect, useState } from 'react';
import insforge from '@/lib/insforge';
import { RequestDecisionHistory, ParticipationRequest } from '@/types';
import { X, History, Clock, User, Shield, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import LoadingSpinner from '@/components/common/LoadingSpinner';

interface DecisionHistoryModalProps {
  request: ParticipationRequest;
  onClose: () => void;
}

export const DecisionHistoryModal: React.FC<DecisionHistoryModalProps> = ({ request, onClose }) => {
  const [history, setHistory] = useState<RequestDecisionHistory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const { data, error } = await insforge.database
          .from('request_decision_history')
          .select('*')
          .eq('request_id', request.id)
          .order('created_at', { ascending: true });

        if (!error && data) {
          setHistory(data as RequestDecisionHistory[]);
        }
      } catch (err) {
        console.error('[DecisionHistoryModal] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [request.id]);

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'incharge':
      case 'admin':
        return <Shield className="w-3.5 h-3.5 text-indigo-400" />;
      case 'proctor':
      case 'faculty':
        return <User className="w-3.5 h-3.5 text-sky-400" />;
      default:
        return <User className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const getStatusIcon = (status: string) => {
    if (status.includes('approved')) return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
    if (status.includes('rejected')) return <XCircle className="w-4 h-4 text-rose-400" />;
    if (status.includes('returned') || status.includes('correction')) return <AlertCircle className="w-4 h-4 text-amber-400" />;
    return <Clock className="w-4 h-4 text-indigo-400" />;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass-panel rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col border border-slate-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 sm:px-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white">Decision Audit Trail</h3>
                <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 font-mono text-[11px] font-bold border border-indigo-500/20">
                  {request.request_reference || 'OD-REF'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {request.student_name} &bull; {request.event?.title || 'Technical Event'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {loading ? (
            <div className="py-12">
              <LoadingSpinner size="md" label="Loading permanent decision history..." />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs">
              No audit trail records found for this request.
            </div>
          ) : (
            <div className="relative pl-6 space-y-8 before:absolute before:left-2.5 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
              {history.map((item, idx) => (
                <div key={item.id || idx} className="relative group">
                  {/* Timeline Node */}
                  <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-slate-900 border-2 border-indigo-500/60 flex items-center justify-center shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                  </div>

                  {/* Card */}
                  <div className="glass-card rounded-2xl p-4 border border-slate-800 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(item.new_status)}
                        <span className="text-xs font-bold text-white capitalize">
                          {item.new_status.replace(/_/g, ' ')}
                        </span>
                        {item.previous_status && (
                          <span className="text-[11px] text-slate-500 flex items-center gap-1">
                            (from {item.previous_status.replace(/_/g, ' ')})
                          </span>
                        )}
                      </div>

                      <span className="text-[11px] font-mono text-slate-500">
                        {new Date(item.created_at).toLocaleString()}
                      </span>
                    </div>

                    {/* Actor Details */}
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                      {getRoleIcon(item.actor_role)}
                      <span>
                        <strong className="text-slate-200">{item.actor_name}</strong> ({item.actor_role})
                      </span>
                    </div>

                    {/* Remarks / Reasons */}
                    {item.remarks && (
                      <div
                        className={`text-xs p-3 rounded-xl border ${
                          item.new_status.includes('rejected')
                            ? 'bg-rose-950/20 border-rose-900/40 text-rose-300'
                            : item.new_status.includes('returned')
                            ? 'bg-amber-950/20 border-amber-900/40 text-amber-300'
                            : item.new_status.includes('approved')
                            ? 'bg-emerald-950/20 border-emerald-900/40 text-emerald-300'
                            : 'bg-slate-900/60 border-slate-800 text-slate-300'
                        }`}
                      >
                        <span className="font-semibold block mb-0.5">Remarks / Reason:</span>
                        {item.remarks}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default DecisionHistoryModal;
