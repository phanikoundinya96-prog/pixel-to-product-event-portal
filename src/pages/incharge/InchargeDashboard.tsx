import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import insforge from '@/lib/insforge';
import { 
  ParticipationRequest, 
  AcademicAttendanceImport, 
  AcademicAttendanceRecord,
  TechnicalEvent
} from '@/types';
import { 
  ShieldCheck, 
  CheckCircle2, 
  XCircle, 
  FileSpreadsheet,
  Download,
  Upload,
  Search,
  AlertTriangle,
  FileCheck2,
  Layers,
  Calendar,
  Plus,
  FileText,
  ExternalLink,
  Eye,
  History,
  MessageSquare
} from 'lucide-react';
import Badge from '@/components/common/Badge';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import { CreateEventModal } from '@/components/events/CreateEventModal';
import { DocumentViewerModal } from '@/components/common/DocumentViewerModal';
import DecisionHistoryModal from '@/components/requests/DecisionHistoryModal';
import { 
  parseCSV, 
  validateAttendanceCSV, 
  generateSampleAttendanceCSV, 
  ImportValidationSummary 
} from '@/utils/csvParser';
import { evaluateEligibility } from '@/utils/eligibility';

export const InchargeDashboard: React.FC = () => {
  const { user, profile } = useAuth();
  const [requests, setRequests] = useState<ParticipationRequest[]>([]);
  const [events, setEvents] = useState<TechnicalEvent[]>([]);
  const [imports, setImports] = useState<AcademicAttendanceImport[]>([]);
  const [attendanceRoster, setAttendanceRoster] = useState<AcademicAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'requests' | 'attendance' | 'events' | 'settings'>('attendance');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Modal States
  const [showCreateEventModal, setShowCreateEventModal] = useState(false);
  const [selectedProofKey, setSelectedProofKey] = useState<string | null>(null);
  const [selectedStudentName, setSelectedStudentName] = useState<string | null>(null);
  const [selectedAuditRequest, setSelectedAuditRequest] = useState<ParticipationRequest | null>(null);
  const [decisionModal, setDecisionModal] = useState<{
    requestId: string;
    studentName: string;
    requestRef: string;
    action: 'approve' | 'reject' | 'return';
    remarks: string;
  } | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);

  // Institution settings state
  const [threshold, setThreshold] = useState<number>(75.0);
  const [freshnessDays, setFreshnessDays] = useState<number>(30);
  const [settingsSaved, setSettingsSaved] = useState<boolean>(false);

  // CSV Import States
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [sourceDate, setSourceDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [importNotes, setImportNotes] = useState<string>('');
  const [validationSummary, setValidationSummary] = useState<ImportValidationSummary | null>(null);
  const [importing, setImporting] = useState<boolean>(false);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);
  const [importErrorMessage, setImportErrorMessage] = useState<string | null>(null);

  // Roster Search State
  const [rosterSearch, setRosterSearch] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      // 1. Fetch all participation requests
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

      // 4. Fetch latest accepted attendance roster
      const completedImports = (impData || []).filter((i: any) => i.status === 'completed');
      if (completedImports.length > 0) {
        const latestImportId = completedImports[0].id;
        const { data: rosterData } = await insforge.database
          .from('academic_attendance_records')
          .select('*')
          .eq('import_id', latestImportId)
          .order('roll_number', { ascending: true });

        setAttendanceRoster((rosterData as AcademicAttendanceRecord[]) || []);
      } else {
        setAttendanceRoster([]);
      }

      // 5. Fetch all technical events
      const { data: evData } = await insforge.database
        .from('events')
        .select('*')
        .order('start_date', { ascending: false });

      setEvents((evData as TechnicalEvent[]) || []);
    } catch (err) {
      console.error('[InchargeDashboard] Data loading error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDownloadTemplate = () => {
    const csvContent = generateSampleAttendanceCSV();
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'sample_attendance_template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setCsvFile(file);
    setImportSuccessMessage(null);
    setImportErrorMessage(null);

    try {
      const text = await file.text();
      const rawRows = parseCSV(text);

      // Fetch existing registered profiles to match roll numbers
      const { data: profilesData } = await insforge.database
        .from('profiles')
        .select('id, name, roll_number, department');

      const profilesByRoll = new Map<string, { id: string; name: string; department: string }>();
      (profilesData || []).forEach((p: any) => {
        if (p.roll_number) {
          profilesByRoll.set(p.roll_number.toUpperCase().trim(), {
            id: p.id,
            name: p.name,
            department: p.department,
          });
        }
      });

      const summary = validateAttendanceCSV(rawRows, profilesByRoll);
      setValidationSummary(summary);
    } catch (err: any) {
      setImportErrorMessage(`Validation failed: ${err.message}`);
      setValidationSummary(null);
    }
  };

  const handleCommitImport = async () => {
    if (!validationSummary || !csvFile || !user?.id) return;
    setImporting(true);
    setImportErrorMessage(null);
    setImportSuccessMessage(null);

    let importBatchId: string | null = null;

    try {
      // 1. Create import record in academic_attendance_imports with 'processing'
      const { data: newImport, error: importCreateError } = await insforge.database
        .from('academic_attendance_imports')
        .insert([
          {
            importer_id: user.id,
            source_date: sourceDate,
            filename: csvFile.name,
            total_rows: validationSummary.totalRows,
            valid_count: 0,
            invalid_count: validationSummary.invalidCount + validationSummary.duplicateCount,
            status: 'processing',
            notes: importNotes || null,
          },
        ])
        .select()
        .single();

      if (importCreateError || !newImport) {
        throw new Error(importCreateError?.message || 'Failed to initialize attendance import record.');
      }

      importBatchId = newImport.id;

      // 2. Prepare valid & unmatched records for insertion
      const recordsToInsert = validationSummary.rows
        .filter((r) => r.isValid)
        .map((r) => ({
          import_id: importBatchId,
          student_id: r.matchedStudentId,
          roll_number: r.roll_number,
          student_name: r.student_name,
          classes_conducted: r.classes_conducted,
          classes_attended: r.classes_attended,
          source_date: sourceDate,
          validation_status: r.status,
          row_error: r.error,
        }));

      if (recordsToInsert.length > 0) {
        const { error: insertError } = await insforge.database
          .from('academic_attendance_records')
          .insert(recordsToInsert);

        if (insertError) {
          throw new Error(`Failed to store attendance records: ${insertError.message}`);
        }
      }

      // 3. Update import record to 'completed'
      const { error: completeError } = await insforge.database
        .from('academic_attendance_imports')
        .update({
          status: 'completed',
          valid_count: recordsToInsert.length,
          invalid_count: validationSummary.invalidCount + validationSummary.duplicateCount,
        })
        .eq('id', importBatchId);

      if (completeError) {
        throw new Error(`Failed to finalize import status: ${completeError.message}`);
      }

      setImportSuccessMessage(
        `Successfully imported ${recordsToInsert.length} valid student attendance records into the portal!`
      );
      setCsvFile(null);
      setValidationSummary(null);
      setImportNotes('');

      // Refresh data to show latest dataset
      await loadData();
    } catch (err: any) {
      console.error('[InchargeDashboard] Import failure:', err);
      // If batch was created, mark as failed so it does not corrupt active dataset
      if (importBatchId) {
        await insforge.database
          .from('academic_attendance_imports')
          .update({ status: 'failed', notes: `Failed: ${err.message}` })
          .eq('id', importBatchId);
      }
      setImportErrorMessage(err.message || 'An unexpected error occurred during import.');
      await loadData();
    } finally {
      setImporting(false);
    }
  };

  const handleDecisionSubmit = async () => {
    if (!decisionModal || !user?.id) return;
    const { requestId, action, remarks } = decisionModal;
    setDecisionError(null);

    if ((action === 'reject' || action === 'return') && (!remarks || !remarks.trim())) {
      setDecisionError(
        action === 'reject'
          ? 'Mandatory: Please provide a reason for the final rejection.'
          : 'Mandatory: Please provide clear, actionable correction instructions for the student.'
      );
      return;
    }

    setActionLoading(requestId);
    const actionType =
      action === 'approve'
        ? 'incharge_approve'
        : action === 'reject'
        ? 'incharge_reject'
        : 'incharge_return';

    try {
      const { error: rpcErr } = await insforge.database.rpc('process_request_workflow_action', {
        p_request_id: requestId,
        p_action: actionType,
        p_remarks: remarks.trim() || 'Approved by Technical Event In-Charge. Official OD Granted.',
      });

      if (rpcErr) {
        console.warn('[InchargeDashboard] RPC fallback to direct update:', rpcErr);
        const newStatus =
          action === 'approve'
            ? 'approved_by_incharge'
            : action === 'reject'
            ? 'rejected_by_incharge'
            : 'returned_for_correction';

        const { error: reqErr } = await insforge.database
          .from('participation_requests')
          .update({
            status: newStatus,
            incharge_id: user.id,
            admin_reviewer_id: user.id,
            admin_remarks: remarks.trim() || 'Approved by Technical Event In-Charge. OD Granted.',
            incharge_reviewed_at: new Date().toISOString(),
          })
          .eq('id', requestId);

        if (reqErr) throw new Error(reqErr.message);

        await insforge.database.from('request_decision_history').insert([
          {
            request_id: requestId,
            actor_id: user.id,
            actor_name: profile?.name || 'In-Charge Admin',
            actor_role: 'incharge',
            new_status: newStatus,
            remarks: remarks.trim() || 'Final OD Decision recorded.',
          },
        ]);
      }

      setDecisionModal(null);
      await loadData();
    } catch (err: any) {
      alert(`Decision recording error: ${err.message}`);
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

  const filteredRoster = attendanceRoster.filter((rec) => {
    const matchesSearch =
      rec.roll_number.toLowerCase().includes(rosterSearch.toLowerCase()) ||
      (rec.student_name && rec.student_name.toLowerCase().includes(rosterSearch.toLowerCase()));
    return matchesSearch;
  });

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
            Manage academic attendance imports, verify eligibility percentages, and grant final OD approvals.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex flex-wrap rounded-xl bg-slate-900 p-1 border border-slate-800 self-start md:self-center gap-1">
          <button
            onClick={() => setActiveTab('attendance')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'attendance'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Attendance & Imports ({attendanceRoster.length})
          </button>
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
            onClick={() => setActiveTab('events')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'events'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Events ({events.length})
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              activeTab === 'settings'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Policy Rules
          </button>
        </div>
      </div>

      {/* Tab 1: Attendance Management & CSV Imports */}
      {activeTab === 'attendance' && (
        <div className="space-y-8">
          {/* Upload Card */}
          <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-800">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-indigo-400" />
                  Import Departmental Academic Attendance
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Upload official attendance spreadsheet. Percentages are auto-calculated from conducted vs attended classes.
                </p>
              </div>

              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-2 shrink-0 transition-all"
              >
                <Download className="w-4 h-4 text-indigo-400" />
                Download CSV Template
              </button>
            </div>

            {/* Upload Area */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <div className="md:col-span-2 border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-2xl p-6 text-center bg-slate-900/40 transition-colors">
                <input
                  type="file"
                  id="attendance-csv"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <label
                  htmlFor="attendance-csv"
                  className="cursor-pointer flex flex-col items-center justify-center gap-2"
                >
                  <Upload className="w-8 h-8 text-indigo-400" />
                  <span className="text-sm font-semibold text-white">
                    {csvFile ? csvFile.name : 'Choose CSV file or drag & drop'}
                  </span>
                  <span className="text-xs text-slate-500">
                    Expected columns: roll_number, student_name, department, classes_conducted, classes_attended
                  </span>
                </label>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Attendance Source Date
                  </label>
                  <input
                    type="date"
                    value={sourceDate}
                    onChange={(e) => setSourceDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Batch Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Oct 2026 Consolidated"
                    value={importNotes}
                    onChange={(e) => setImportNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Notification Messages */}
            {importSuccessMessage && (
              <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                <span>{importSuccessMessage}</span>
              </div>
            )}

            {importErrorMessage && (
              <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{importErrorMessage}</span>
              </div>
            )}

            {/* Validation Preview */}
            {validationSummary && (
              <div className="space-y-4 pt-4 border-t border-slate-800">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <FileCheck2 className="w-4 h-4 text-emerald-400" />
                    Validation Results Preview
                  </h3>

                  <button
                    type="button"
                    onClick={handleCommitImport}
                    disabled={importing || validationSummary.validCount === 0}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white flex items-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-95"
                  >
                    {importing ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        Accept & Import Valid Rows ({validationSummary.validCount})
                      </>
                    )}
                  </button>
                </div>

                {/* Validation Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                  <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-center">
                    <div className="text-lg font-bold text-white">{validationSummary.totalRows}</div>
                    <div className="text-[10px] text-slate-500">Total Rows</div>
                  </div>
                  <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-800/40 text-center">
                    <div className="text-lg font-bold text-emerald-400">{validationSummary.validCount}</div>
                    <div className="text-[10px] text-emerald-500 font-semibold">Valid</div>
                  </div>
                  <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800/40 text-center">
                    <div className="text-lg font-bold text-rose-400">{validationSummary.invalidCount}</div>
                    <div className="text-[10px] text-rose-500 font-semibold">Invalid</div>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-800/40 text-center">
                    <div className="text-lg font-bold text-amber-400">{validationSummary.duplicateCount}</div>
                    <div className="text-[10px] text-amber-500 font-semibold">Duplicates</div>
                  </div>
                  <div className="p-3 rounded-xl bg-sky-950/40 border border-sky-800/40 text-center">
                    <div className="text-lg font-bold text-sky-400">{validationSummary.unmatchedCount}</div>
                    <div className="text-[10px] text-sky-500 font-semibold">Unmatched Profiles</div>
                  </div>
                </div>

                {/* Rows Table */}
                <div className="overflow-x-auto rounded-xl border border-slate-800 max-h-80 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-900 text-slate-400 uppercase tracking-wider sticky top-0">
                      <tr>
                        <th className="p-2.5">Row</th>
                        <th className="p-2.5">Roll No</th>
                        <th className="p-2.5">Student Name</th>
                        <th className="p-2.5">Conducted</th>
                        <th className="p-2.5">Attended</th>
                        <th className="p-2.5">Calculated %</th>
                        <th className="p-2.5">Validation Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {validationSummary.rows.map((row) => (
                        <tr key={row.rowIndex} className="hover:bg-slate-900/50">
                          <td className="p-2.5 font-mono text-slate-500">#{row.rowIndex}</td>
                          <td className="p-2.5 font-bold text-white">{row.roll_number}</td>
                          <td className="p-2.5 text-slate-300">{row.student_name}</td>
                          <td className="p-2.5 text-slate-400">{row.classes_conducted}</td>
                          <td className="p-2.5 text-slate-400">{row.classes_attended}</td>
                          <td className="p-2.5 font-semibold text-indigo-300">
                            {row.attendance_percentage !== null ? `${row.attendance_percentage}%` : 'Unavailable'}
                          </td>
                          <td className="p-2.5">
                            {row.status === 'valid' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                                VALID
                              </span>
                            )}
                            {row.status === 'unmatched_student' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-500/10 text-sky-400 border border-sky-500/30">
                                UNMATCHED PROFILE
                              </span>
                            )}
                            {row.status === 'duplicate' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30" title={row.error || ''}>
                                DUPLICATE
                              </span>
                            )}
                            {row.status === 'invalid' && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30" title={row.error || ''}>
                                INVALID: {row.error}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          {/* Active Accepted Student Roster */}
          <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-800">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-emerald-400" />
                  Latest Accepted Attendance Dataset
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Active roster evaluating student participation eligibility across all department OD requests.
                </p>
              </div>

              {/* Search */}
              <div className="relative w-full md:w-64">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={rosterSearch}
                  onChange={(e) => setRosterSearch(e.target.value)}
                  placeholder="Search roll number, name..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {filteredRoster.length === 0 ? (
              <div className="text-center py-12 border border-slate-800/80 rounded-2xl">
                <FileSpreadsheet className="w-10 h-10 text-slate-600 mx-auto mb-2" />
                <p className="text-sm text-slate-400 font-medium">No active attendance records in the accepted dataset.</p>
                <p className="text-xs text-slate-500 mt-1">Upload a validated CSV batch above to populate the institutional roster.</p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-slate-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-slate-400 uppercase tracking-wider">
                    <tr>
                      <th className="p-3">Roll No</th>
                      <th className="p-3">Student Name</th>
                      <th className="p-3">Conducted</th>
                      <th className="p-3">Attended</th>
                      <th className="p-3">Attendance %</th>
                      <th className="p-3">Eligibility Status</th>
                      <th className="p-3">Source Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {filteredRoster.map((rec) => {
                      const evalRes = evaluateEligibility(rec, {
                        min_attendance_threshold: threshold,
                        attendance_freshness_days: freshnessDays,
                      });

                      return (
                        <tr key={rec.id} className="hover:bg-slate-900/40">
                          <td className="p-3 font-bold text-white">{rec.roll_number}</td>
                          <td className="p-3 text-slate-300">{rec.student_name || '—'}</td>
                          <td className="p-3 text-slate-400">{rec.classes_conducted}</td>
                          <td className="p-3 text-slate-400">{rec.classes_attended}</td>
                          <td className="p-3 font-bold text-white">
                            {rec.attendance_percentage !== null ? `${rec.attendance_percentage}%` : 'Unavailable'}
                          </td>
                          <td className="p-3">
                            <Badge status={evalRes.status} size="sm" />
                          </td>
                          <td className="p-3 text-slate-500">{rec.source_date}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Historical Imports Log */}
          <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-800">
            <h2 className="text-lg font-bold text-white mb-2">Import Audit History</h2>
            <p className="text-xs text-slate-400 mb-6">
              Permanent chronological record of every spreadsheet import. Previously accepted imports are never silently overwritten.
            </p>

            {imports.length === 0 ? (
              <p className="text-xs text-slate-500">No previous imports on record.</p>
            ) : (
              <div className="divide-y divide-slate-800">
                {imports.map((imp) => (
                  <div key={imp.id} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-sm text-white">{imp.filename}</span>
                        <Badge status={imp.status} size="sm" />
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        Source Date: <strong className="text-slate-300">{imp.source_date}</strong> &bull; Valid Records: <strong className="text-emerald-400">{imp.valid_count}</strong> &bull; Errors: <strong className="text-rose-400">{imp.invalid_count}</strong>
                      </p>
                      {imp.notes && (
                        <p className="text-xs text-slate-500 italic mt-0.5">Notes: {imp.notes}</p>
                      )}
                    </div>

                    <span className="text-xs text-slate-500 font-mono">
                      {new Date(imp.import_timestamp).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Final Approvals */}
      {activeTab === 'requests' && (
        <div className="glass-panel rounded-2xl p-6 border border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-bold text-white">
                Proctor-Reviewed Requests Awaiting Final OD Grant
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Examine mentor recommendations, verify attendance snapshots, and record official In-Charge final decisions.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-xl bg-amber-500/10 text-amber-400 text-xs font-bold border border-amber-500/20">
                {pendingFinalDecisions.length} Pending Decision
              </span>
              <span className="px-3 py-1 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold border border-slate-700">
                {requests.length} Total
              </span>
            </div>
          </div>

          {pendingFinalDecisions.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle2 className="w-10 h-10 text-slate-600 mx-auto mb-2" />
              <p className="text-sm text-slate-400 font-medium">All proctor-reviewed requests have been processed.</p>
              <p className="text-xs text-slate-500 mt-1">New recommendations from proctors will arrive in this queue automatically.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pendingFinalDecisions.map((req) => (
                <div
                  key={req.id}
                  className="glass-card rounded-2xl p-5 border border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-6"
                >
                  <div className="space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="text-base font-bold text-white">{req.student_name}</h3>
                      <span className="text-xs font-mono text-slate-400">({req.roll_number})</span>
                      <span className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-400 font-mono text-[11px] font-bold border border-indigo-500/20">
                        {req.request_reference || 'OD-REF'}
                      </span>
                      <Badge status={req.status} size="sm" />

                      {/* Proctor Recommendation Pill */}
                      {req.proctor_recommendation === 'recommended' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Proctor Endorsed
                        </span>
                      ) : req.proctor_recommendation === 'rejected' ? (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                          <XCircle className="w-3 h-3" />
                          Proctor Recommend Reject
                        </span>
                      ) : null}
                    </div>

                    <p className="text-xs text-slate-300">
                      Event: <strong className="text-white">{req.event?.title || 'Technical Event'}</strong> &bull; Dept: {req.department} &bull; Days: {req.od_days_requested}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
                      <span>
                        Submission Snapshot:{' '}
                        <strong className="text-white">
                          {req.submission_attendance_percentage !== null && req.submission_attendance_percentage !== undefined
                            ? `${req.submission_attendance_percentage}%`
                            : 'Unavailable'}
                        </strong>{' '}
                        ({req.submission_eligibility_status || 'N/A'}, threshold: {req.submission_threshold_applied ?? 75}%)
                      </span>
                      {req.od_start_date && (
                        <span>
                          &bull; OD Dates: <strong className="text-slate-300">{req.od_start_date} to {req.od_end_date}</strong>
                        </span>
                      )}
                    </div>

                    {req.faculty_remarks && (
                      <p className="text-xs text-sky-400 bg-sky-950/40 p-2.5 rounded-xl border border-sky-800/40 max-w-2xl">
                        <strong>Proctor Notes: </strong>&quot;{req.faculty_remarks}&quot;
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    {/* Vault Proof Document Viewer Button */}
                    {(req.proof_document_key || req.proof_document_url || req.supporting_document_url || req.certificate_url) && (
                      <button
                        onClick={() => {
                          setSelectedProofKey((req.proof_document_key || req.proof_document_url || req.supporting_document_url || req.certificate_url)!);
                          setSelectedStudentName(req.student_name);
                        }}
                        className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-indigo-400 border border-slate-700 flex items-center gap-1.5 transition-all"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Vault Proof
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

                    {/* Grant Final OD */}
                    <button
                      onClick={() =>
                        setDecisionModal({
                          requestId: req.id,
                          studentName: req.student_name,
                          requestRef: req.request_reference || 'OD-REF',
                          action: 'approve',
                          remarks: 'Approved by Technical Event In-Charge. Official OD Granted.',
                        })
                      }
                      disabled={actionLoading === req.id}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-md shadow-emerald-600/20 active:scale-95"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Grant Final OD
                    </button>

                    {/* Return for Correction */}
                    <button
                      onClick={() =>
                        setDecisionModal({
                          requestId: req.id,
                          studentName: req.student_name,
                          requestRef: req.request_reference || 'OD-REF',
                          action: 'return',
                          remarks: '',
                        })
                      }
                      disabled={actionLoading === req.id}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white flex items-center gap-1.5 active:scale-95"
                    >
                      <MessageSquare className="w-4 h-4" />
                      Return
                    </button>

                    {/* Reject */}
                    <button
                      onClick={() =>
                        setDecisionModal({
                          requestId: req.id,
                          studentName: req.student_name,
                          requestRef: req.request_reference || 'OD-REF',
                          action: 'reject',
                          remarks: '',
                        })
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

      {/* Tab 3: Technical Events Directory & Publishing */}
      {activeTab === 'events' && (
        <div className="space-y-6">
          <div className="glass-panel rounded-3xl p-6 sm:p-8 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-400" />
                Technical Events Management
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Publish upcoming hackathons, symposiums and conferences with official brochures for student applications.
              </p>
            </div>

            <button
              onClick={() => setShowCreateEventModal(true)}
              className="px-4 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2 shadow-lg shadow-indigo-600/30 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              Publish New Event
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {events.map((ev) => {
              const isPastDeadline = ev.registration_deadline
                ? new Date(ev.registration_deadline) < new Date()
                : false;

              return (
                <div
                  key={ev.id}
                  className="glass-card rounded-2xl p-5 border border-slate-800 flex flex-col justify-between space-y-4 hover:border-slate-700 transition-all"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                        {ev.category}
                      </span>
                      <span className="text-[11px] font-medium text-slate-400">
                        {ev.event_mode}
                      </span>
                    </div>

                    <h3 className="text-base font-bold text-white line-clamp-1">{ev.title}</h3>
                    <p className="text-xs text-slate-400 line-clamp-2">{ev.description}</p>

                    <div className="text-xs text-slate-300 space-y-1 pt-2 border-t border-slate-800/80">
                      <div>
                        Organizer: <span className="font-semibold text-white">{ev.organizer_name}</span>
                      </div>
                      <div>
                        Venue: <span className="text-slate-400">{ev.venue}</span>
                      </div>
                      <div>
                        Dates: <span className="text-slate-400">{ev.start_date} to {ev.end_date}</span>
                      </div>
                      {ev.registration_deadline && (
                        <div className="flex items-center gap-2">
                          <span>Deadline: {ev.registration_deadline}</span>
                          {isPastDeadline ? (
                            <span className="text-[10px] text-rose-400 font-bold bg-rose-500/10 px-1.5 py-0.5 rounded">
                              Closed
                            </span>
                          ) : (
                            <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded">
                              Open
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-800 text-xs">
                    {ev.brochure_url ? (
                      <a
                        href={ev.brochure_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-400 hover:text-indigo-300 font-semibold flex items-center gap-1"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Brochure
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-slate-500">No brochure</span>
                    )}

                    <span className="text-[11px] text-slate-500">
                      Max: {ev.max_participants}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Create Event Modal */}
      {showCreateEventModal && (
        <CreateEventModal
          onClose={() => setShowCreateEventModal(false)}
          onSuccess={() => {
            setShowCreateEventModal(false);
            loadData();
          }}
        />
      )}

      {/* Document Vault Viewer Modal */}
      {selectedProofKey && (
        <DocumentViewerModal
          objectKey={selectedProofKey}
          studentName={selectedStudentName || undefined}
          onClose={() => {
            setSelectedProofKey(null);
            setSelectedStudentName(null);
          }}
        />
      )}

      {/* Decision Confirmation Modal */}
      {decisionModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="glass-panel rounded-3xl p-6 max-w-md w-full border border-slate-700 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">
              {decisionModal.action === 'approve'
                ? 'Grant Final OD Approval'
                : decisionModal.action === 'reject'
                ? 'Reject OD Application'
                : 'Return Application for Correction'}
            </h3>
            <p className="text-xs text-slate-400 mb-3">
              Application <strong className="text-white">{decisionModal.requestRef}</strong> for {decisionModal.studentName}.
              {decisionModal.action === 'approve'
                ? ' This decision authorizes official OD attendance credit.'
                : ' An immutable entry will be appended to the decision history.'}
            </p>

            {decisionError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs mb-3 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{decisionError}</span>
              </div>
            )}

            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              In-Charge Remarks / Instructions{' '}
              {decisionModal.action !== 'approve' && <span className="text-rose-400">* (Required)</span>}
            </label>
            <textarea
              rows={4}
              value={decisionModal.remarks}
              onChange={(e) => {
                setDecisionModal({ ...decisionModal, remarks: e.target.value });
                if (decisionError) setDecisionError(null);
              }}
              className="w-full p-3 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 mb-4"
              placeholder={
                decisionModal.action === 'approve'
                  ? 'Add administrative remarks (optional)...'
                  : decisionModal.action === 'reject'
                  ? 'Specify mandatory reason for final rejection...'
                  : 'Detail actionable corrections required from student (mandatory)...'
              }
            />

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setDecisionModal(null);
                  setDecisionError(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDecisionSubmit}
                disabled={actionLoading !== null}
                className={`px-4 py-2 rounded-xl text-xs font-bold text-white flex items-center gap-2 ${
                  decisionModal.action === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/30'
                    : decisionModal.action === 'reject'
                    ? 'bg-rose-600 hover:bg-rose-500 shadow-lg shadow-rose-600/30'
                    : 'bg-amber-600 hover:bg-amber-500 shadow-lg shadow-amber-600/30'
                }`}
              >
                {actionLoading ? 'Recording...' : 'Confirm Decision'}
              </button>
            </div>
          </div>
        </div>
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

export default InchargeDashboard;
