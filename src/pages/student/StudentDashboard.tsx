import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import insforge from '@/lib/insforge';
import { ParticipationRequest, AcademicAttendanceRecord, ProctorAssignment } from '@/types';
import { 
  FileText, 
  UserCheck, 
  GraduationCap, 
  ExternalLink,
  Plus
} from 'lucide-react';
import Badge from '@/components/common/Badge';
import LoadingSpinner from '@/components/common/LoadingSpinner';

interface StudentDashboardProps {
  onNavigateToEvents: () => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({ onNavigateToEvents }) => {
  const { user, profile } = useAuth();
  const [requests, setRequests] = useState<ParticipationRequest[]>([]);
  const [attendance, setAttendance] = useState<AcademicAttendanceRecord | null>(null);
  const [proctorAssignment, setProctorAssignment] = useState<ProctorAssignment | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

        // 2. Fetch Latest Accepted Attendance Snapshot
        if (profile?.roll_number) {
          const { data: attData } = await insforge.database
            .from('academic_attendance_records')
            .select('*')
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

    loadStudentData();
  }, [user?.id, profile?.roll_number]);

  if (loading) {
    return (
      <div className="py-24">
        <LoadingSpinner size="lg" label="Synchronizing student records and OD requests..." />
      </div>
    );
  }

  const attendancePct = attendance ? attendance.attendance_percentage : null;
  const isEligible = attendancePct !== null ? attendancePct >= 75.0 : false;

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

        <button
          onClick={onNavigateToEvents}
          className="px-5 py-3 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition-all active:scale-95 self-start md:self-center"
        >
          <Plus className="w-4 h-4" />
          Apply for New OD
        </button>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Attendance Eligibility Card */}
        <div className="glass-card rounded-2xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400">Academic Attendance</span>
            {attendancePct !== null ? (
              <Badge status={isEligible ? 'eligible' : 'ineligible'} size="sm" />
            ) : (
              <Badge status="missing_data" size="sm" />
            )}
          </div>
          <div className="text-3xl font-extrabold text-white">
            {attendancePct !== null ? `${attendancePct}%` : 'No Snapshot'}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {attendance
              ? `${attendance.classes_attended} / ${attendance.classes_conducted} classes attended (Source: ${attendance.source_date})`
              : 'Waiting for department attendance spreadsheet import.'}
          </p>
        </div>

        {/* Proctor Mentor Card */}
        <div className="glass-card rounded-2xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400">Assigned Proctor</span>
            <UserCheck className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-lg font-bold text-white truncate">
            {proctorAssignment?.proctor?.name || 'Academic Advisor Assigned'}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {proctorAssignment?.proctor?.email || 'Reviews and endorses OD requests before In-Charge finalization.'}
          </p>
        </div>

        {/* Requests Count Card */}
        <div className="glass-card rounded-2xl p-6 border border-slate-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold text-slate-400">Active OD Applications</span>
            <FileText className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-3xl font-extrabold text-white">
            {requests.length}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {requests.filter(r => r.status === 'approved' || r.status === 'approved_by_incharge').length} Approved &bull; {requests.filter(r => r.status.includes('pending') || r.status === 'submitted').length} In Review
          </p>
        </div>
      </div>

      {/* OD Requests List */}
      <div className="glass-panel rounded-2xl p-6 border border-slate-800">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">My Participation & OD Requests</h2>
          <span className="text-xs text-slate-500 font-mono">Realtime RLS Enforced</span>
        </div>

        {requests.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-10 h-10 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400 font-medium">No participation requests submitted yet.</p>
            <p className="text-xs text-slate-500 mt-1">Select an accredited event to request On-Duty (OD) approval.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {requests.map((req) => (
              <div key={req.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-bold text-white">
                      {req.event?.title || 'Technical Event'}
                    </h3>
                    <Badge status={req.status} size="sm" />
                  </div>
                  <p className="text-xs text-slate-400">
                    Role: <span className="text-slate-300 font-medium">{req.event_role}</span> &bull; Days Requested: <span className="text-slate-300 font-medium">{req.od_days_requested}</span> &bull; Submitted on {new Date(req.created_at).toLocaleDateString()}
                  </p>
                  {req.faculty_remarks && (
                    <p className="text-xs text-sky-400/90 italic bg-sky-950/30 px-2.5 py-1 rounded-lg border border-sky-800/40 inline-block mt-1">
                      Proctor Remark: "{req.faculty_remarks}"
                    </p>
                  )}
                  {req.admin_remarks && (
                    <p className="text-xs text-indigo-400/90 italic bg-indigo-950/30 px-2.5 py-1 rounded-lg border border-indigo-800/40 inline-block mt-1">
                      In-Charge Decision: "{req.admin_remarks}"
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-3 self-end md:self-center">
                  {req.proof_document_url && (
                    <a
                      href={req.proof_document_url}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      View Proof
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentDashboard;
