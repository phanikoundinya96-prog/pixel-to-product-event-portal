import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import insforge from '@/lib/insforge';
import { ParticipationRequest, AcademicAttendanceImport } from '@/types';
import { 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  FileSpreadsheet
} from 'lucide-react';
import Badge from '@/components/common/Badge';
import LoadingSpinner from '@/components/common/LoadingSpinner';

export const InchargeDashboard: React.FC = () => {
  const { user, profile } = useAuth();
  const [requests, setRequests] = useState<ParticipationRequest[]>([]);
  const [imports, setImports] = useState<AcademicAttendanceImport[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'requests' | 'imports' | 'settings'>('requests');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Institution settings state
  const [threshold, setThreshold] = useState<number>(75.0);
  const [freshnessDays, setFreshnessDays] = useState<number>(30);
  const [settingsSaved, setSettingsSaved] = useState<boolean>(false);

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch all participation requests (Incharge has full RLS visibility)
      const { data: reqData } = await insforge.database
        .from('participation_requests')
        .select('*, event:events(*)')
        .order('created_at', { ascending: false });

      setRequests((reqData as ParticipationRequest[]) || []);

      // 2. Fetch institution settings
      const { data: settsData } = await insforge.database
        .from('institution_settings')
        .select('*')
        .eq('id', 'default')
        .single();

      if (settsData) {
        setThreshold(settsData.min_attendance_threshold);
        setFreshnessDays(settsData.attendance_freshness_days);
      }

      // 3. Fetch academic attendance imports history
      const { data: impData } = await insforge.database
        .from('academic_attendance_imports')
        .select('*')
        .order('import_timestamp', { ascending: false });

      setImports((impData as AcademicAttendanceImport[]) || []);
    } catch (err) {
      console.error('[InchargeDashboard] Data loading error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDecision = async (
    requestId: string,
    action: 'approve' | 'reject',
    remarks: string
  ) => {
    if (!user?.id) return;
    setActionLoading(requestId);
    const newStatus = action === 'approve' ? 'approved_by_incharge' : 'rejected_by_incharge';

    try {
      // 1. Update request status
      const { error: reqErr } = await insforge.database
        .from('participation_requests')
        .update({
          status: newStatus,
          incharge_id: user.id,
          admin_reviewer_id: user.id,
          admin_remarks: remarks,
          admin_reviewed_at: new Date().toISOString(),
        })
        .eq('id', requestId);

      if (reqErr) {
        alert(`Error updating request: ${reqErr.message}`);
        setActionLoading(null);
        return;
      }

      // 2. Append to decision history
      await insforge.database
        .from('request_decision_history')
        .insert([
          {
            request_id: requestId,
            actor_id: user.id,
            actor_name: profile?.name || 'In-Charge Admin',
            actor_role: 'incharge',
            new_status: newStatus,
            remarks,
          },
        ]);

      await loadData();
    } catch (err: any) {
      alert(`Unexpected error: ${err?.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    try {
      const { error } = await insforge.database
        .from('institution_settings')
        .update({
          min_attendance_threshold: threshold,
          attendance_freshness_days: freshnessDays,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 'default');

      if (error) {
        alert(`Failed to save settings: ${error.message}`);
      } else {
        setSettingsSaved(true);
        setTimeout(() => setSettingsSaved(false), 2000);
      }
    } catch (err: any) {
      alert(`Settings error: ${err?.message}`);
    }
  };

  if (loading) {
    return (
      <div className="py-24">
        <LoadingSpinner size="lg" label="Loading In-Charge administrative controls..." />
      </div>
    );
  }

  const pendingFinalDecisions = requests.filter(
    (r) => r.status === 'recommended_by_proctor' || r.status === 'pending_incharge' || r.status === 'pending_admin'
  );

  return (
    <div className="space-y-8 py-6">
      {/* Header */}
      <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 mb-2">
            <ShieldCheck className="w-3.5 h-3.5" />
            Technical Event In-Charge Administration
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">
            Portal Control Center & Approvals
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Final authority for institutional OD grant, academic attendance imports, and threshold policy configuration.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-slate-900 p-1 border border-slate-800 self-start md:self-center">
          <button
            onClick={() => setActiveTab('requests')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'requests'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Final Approvals ({pendingFinalDecisions.length})
          </button>
          <button
            onClick={() => setActiveTab('imports')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'imports'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Attendance Imports ({imports.length})
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'settings'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Settings
          </button>
        </div>
      </div>

      {/* Tab 1: Final Approvals */}
      {activeTab === 'requests' && (
        <div className="glass-panel rounded-2xl p-6 border border-slate-800">
          <h2 className="text-lg font-bold text-white mb-6">
            Proctor-Endorsed Requests Awaiting Final OD Grant
          </h2>

          {requests.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle2 className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-400 font-medium">All student participation requests are processed.</p>
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
                      <h3 className="text-base font-bold text-white">{req.student_name}</h3>
                      <span className="text-xs font-mono text-slate-400">({req.roll_number})</span>
                      <Badge status={req.status} size="sm" />
                    </div>

                    <p className="text-xs text-slate-300">
                      Event: <strong className="text-white">{req.event?.title || 'Technical Event'}</strong> &bull; Dept: {req.department} &bull; Days: {req.od_days_requested}
                    </p>

                    {req.faculty_remarks && (
                      <p className="text-xs text-sky-400 bg-sky-950/40 p-2 rounded-lg border border-sky-800/40">
                        <strong>Proctor Endorsement: </strong>"{req.faculty_remarks}"
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() =>
                        handleDecision(req.id, 'approve', 'Approved by Technical Event In-Charge. OD Granted.')
                      }
                      disabled={actionLoading === req.id}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Grant Final OD
                    </button>

                    <button
                      onClick={() =>
                        handleDecision(req.id, 'reject', 'Rejected by Technical Event In-Charge.')
                      }
                      disabled={actionLoading === req.id}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 flex items-center gap-1.5 active:scale-95"
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
      )}

      {/* Tab 2: Attendance Imports */}
      {activeTab === 'imports' && (
        <div className="glass-panel rounded-2xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-bold text-white">Academic Attendance Imports</h2>
              <p className="text-xs text-slate-400 mt-1">
                Preserved historical spreadsheets and validation logs. Previous imports are never silently overwritten.
              </p>
            </div>
          </div>

          {imports.length === 0 ? (
            <div className="text-center py-16">
              <FileSpreadsheet className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-400 font-medium">No CSV or Excel attendance batches uploaded yet.</p>
              <p className="text-xs text-slate-500 mt-1">Attendance import worker will populate validated student percentages.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {imports.map((imp) => (
                <div key={imp.id} className="py-4 flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">{imp.filename}</h3>
                    <p className="text-xs text-slate-400">
                      Imported on {new Date(imp.import_timestamp).toLocaleString()} &bull; Valid Records: {imp.valid_count} &bull; Errors: {imp.invalid_count}
                    </p>
                  </div>
                  <Badge status={imp.status} size="sm" />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab 3: Institutional Threshold & Freshness Settings */}
      {activeTab === 'settings' && (
        <div className="glass-panel rounded-2xl p-6 border border-slate-800 max-w-xl">
          <h2 className="text-lg font-bold text-white mb-2">Eligibility Policy Rules</h2>
          <p className="text-xs text-slate-400 mb-6">
            Configure automated eligibility validation criteria across all technical event applications.
          </p>

          {settingsSaved && (
            <div className="mb-4 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
              Settings updated successfully in PostgreSQL database!
            </div>
          )}

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Minimum Attendance Percentage Threshold (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.5"
                value={threshold}
                onChange={(e) => setThreshold(parseFloat(e.target.value) || 0)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Students below this threshold are flagged as ineligible for OD approval.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Attendance Data Freshness Window (Days)
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={freshnessDays}
                onChange={(e) => setFreshnessDays(parseInt(e.target.value) || 30)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white focus:outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Imports older than this window will be marked as STALE_DATA.
              </p>
            </div>

            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/30 active:scale-95"
            >
              Update Policy Configuration
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

export default InchargeDashboard;
