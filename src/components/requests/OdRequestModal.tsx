import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import insforge from '@/lib/insforge';
import { TechnicalEvent, EventCategory } from '@/types';
import { 
  X, 
  Upload, 
  Globe, 
  CheckCircle2, 
  AlertCircle, 
  AlertTriangle,
  Lock,
  ArrowRight,
  ArrowLeft,
  FileCheck
} from 'lucide-react';
import { validateProofDocument, uploadStudentProof } from '@/utils/documentVault';

interface OdRequestModalProps {
  initialEvent?: TechnicalEvent | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const OdRequestModal: React.FC<OdRequestModalProps> = ({
  initialEvent,
  onClose,
  onSuccess,
}) => {
  const { user, profile } = useAuth();
  const [step, setStep] = useState<number>(1);
  const [eventsList, setEventsList] = useState<TechnicalEvent[]>([]);

  // Form Fields
  const [selectedEventId, setSelectedEventId] = useState<string>(initialEvent?.id || '');
  const [eventTitle, setEventTitle] = useState<string>(initialEvent?.title || '');
  const [organizerName, setOrganizerName] = useState<string>(initialEvent?.organizer_name || '');
  const [category, setCategory] = useState<EventCategory>(initialEvent?.category || 'Hackathon');
  const [venue, setVenue] = useState<string>(initialEvent?.venue || '');
  const [city, setCity] = useState<string>('');
  const [startDate, setStartDate] = useState<string>(
    initialEvent?.start_date ? initialEvent.start_date.split('T')[0] : ''
  );
  const [endDate, setEndDate] = useState<string>(
    initialEvent?.end_date ? initialEvent.end_date.split('T')[0] : ''
  );
  const [websiteUrl, setWebsiteUrl] = useState<string>('');
  const [reasonStatement, setReasonStatement] = useState<string>('');
  const [eventRole, setEventRole] = useState<string>('Participant');
  const [teamName, setTeamName] = useState<string>('');
  const [teamMembersText, setTeamMembersText] = useState<string>('');
  const [odDaysRequested, setOdDaysRequested] = useState<number>(1);

  // File Upload State
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [uploadedProofKey, setUploadedProofKey] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');

  // Status & Validation States
  const [overlapWarning, setOverlapWarning] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Fetch available events if not preselected
  useEffect(() => {
    const fetchEvents = async () => {
      const { data } = await insforge.database
        .from('events')
        .select('*')
        .order('start_date', { ascending: true });
      if (data) {
        setEventsList(data as TechnicalEvent[]);
      }
    };
    fetchEvents();
  }, []);

  // Update prefilled event details when an event is selected from the dropdown
  const handleEventSelect = (id: string) => {
    setSelectedEventId(id);
    const ev = eventsList.find((e) => e.id === id);
    if (ev) {
      setEventTitle(ev.title);
      setOrganizerName(ev.organizer_name);
      setCategory(ev.category);
      setVenue(ev.venue);
      setStartDate(ev.start_date ? ev.start_date.split('T')[0] : '');
      setEndDate(ev.end_date ? ev.end_date.split('T')[0] : '');
    }
  };

  // Check for date range overlap with existing requests
  useEffect(() => {
    const checkOverlap = async () => {
      if (!user?.id || !startDate || !endDate) return;

      try {
        const { data: existing } = await insforge.database
          .from('participation_requests')
          .select('id, student_name, od_start_date, od_end_date, event:events(title)')
          .eq('student_id', user.id);

        if (existing && existing.length > 0) {
          const reqStart = new Date(startDate);
          const reqEnd = new Date(endDate);

          const overlapping = existing.find((item: any) => {
            if (!item.od_start_date || !item.od_end_date) return false;
            const exStart = new Date(item.od_start_date);
            const exEnd = new Date(item.od_end_date);
            return reqStart <= exEnd && reqEnd >= exStart;
          });

          if (overlapping) {
            const evTitle = Array.isArray(overlapping.event)
              ? (overlapping.event[0] as any)?.title
              : (overlapping.event as any)?.title;
            setOverlapWarning(
              `Notice: The selected date range overlaps with existing application (${evTitle || 'Another Event'} from ${overlapping.od_start_date} to ${overlapping.od_end_date}). This application will be highlighted for proctor schedule review.`
            );
          } else {
            setOverlapWarning(null);
          }
        }
      } catch (err) {
        console.error('[OdRequestModal] Overlap check error:', err);
      }
    };

    checkOverlap();
  }, [user?.id, startDate, endDate]);

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const validation = validateProofDocument(file);
    if (!validation.valid) {
      setErrorMessage(validation.error);
      setProofFile(null);
      return;
    }

    setErrorMessage(null);
    setProofFile(file);
  };

  const handleNextStep = () => {
    setErrorMessage(null);

    if (step === 1) {
      if (!eventTitle.trim()) {
        setErrorMessage('Please provide the event title.');
        return;
      }
      if (!venue.trim()) {
        setErrorMessage('Please specify the event venue.');
        return;
      }
      if (!startDate || !endDate) {
        setErrorMessage('Please provide both start and end dates.');
        return;
      }
      if (new Date(endDate) < new Date(startDate)) {
        setErrorMessage('Event end date cannot be earlier than start date.');
        return;
      }
      setStep(2);
    } else if (step === 2) {
      if (!reasonStatement.trim()) {
        setErrorMessage('Please state the purpose and expected technical/academic benefit.');
        return;
      }
      if (reasonStatement.trim().length < 20) {
        setErrorMessage('Please provide a descriptive reason statement (at least 20 characters).');
        return;
      }
      setStep(3);
    }
  };

  const handleSubmit = async (isDraft: boolean = false) => {
    if (!user?.id) {
      setErrorMessage('You must be signed in to submit an OD request.');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    let proofKey = uploadedProofKey;

    // Step A: Upload file if not already uploaded
    if (proofFile && !proofKey) {
      setIsUploading(true);
      setUploadProgress('Uploading document to private encrypted vault...');
      const uploadRes = await uploadStudentProof(proofFile, user.id);
      setIsUploading(false);

      if (uploadRes.error || !uploadRes.key) {
        setIsSubmitting(false);
        setErrorMessage(`Vault upload failed: ${uploadRes.error}. Submission aborted.`);
        return;
      }
      proofKey = uploadRes.key;
      setUploadedProofKey(proofKey);
    }

    if (!isDraft && !proofKey) {
      setIsSubmitting(false);
      setErrorMessage('A supporting proof document (acceptance letter / registration ticket) is mandatory for submission.');
      return;
    }

    // Parse team members
    const teamMembersList = teamMembersText
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const statusValue = isDraft ? 'draft' : 'submitted';

    try {
      // Step B: Insert into participation_requests
      // Note: Triggers automatically populate authoritative identity, generate reference code, and derive submission-time attendance snapshot
      const { data, error } = await insforge.database
        .from('participation_requests')
        .insert([
          {
            event_id: selectedEventId || null,
            student_id: user.id,
            student_name: profile?.name || user.email?.split('@')[0] || 'Student',
            student_email: profile?.email || user.email || '',
            roll_number: profile?.roll_number || 'PENDING',
            department: profile?.department || 'General',
            reason_statement: reasonStatement,
            event_role: eventRole,
            team_name: teamName || null,
            team_members: teamMembersList,
            proof_document_key: proofKey || null,
            event_city: city || null,
            event_website_url: websiteUrl || null,
            od_start_date: startDate,
            od_end_date: endDate,
            od_days_requested: odDaysRequested,
            status: statusValue,
          },
        ])
        .select()
        .single();

      if (error || !data) {
        throw new Error(error?.message || 'Failed to persist participation request.');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[OdRequestModal] Submission failed:', err);
      if (err.message.includes('uq_event_student')) {
        setErrorMessage('Duplicate submission: You have already submitted an OD request for this event.');
      } else {
        setErrorMessage(err.message || 'An unexpected error occurred during submission.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass-panel rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col border border-slate-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-5 sm:px-8 border-b border-slate-800 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Step {step} of 3
              </span>
              <h2 className="text-base font-extrabold text-white">
                Technical Event Participation & OD Application
              </h2>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              {step === 1 && 'Event Information & Venue Schedule'}
              {step === 2 && 'Participation Scope, Role & Academic Benefit'}
              {step === 3 && 'Supporting Document Upload & Review'}
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <div className="flex-1 p-5 sm:p-8 overflow-y-auto space-y-6">
          {/* Identity Notice (Read-only verified values) */}
          <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-slate-300">
                Applicant: <strong className="text-white">{profile?.name}</strong> ({profile?.roll_number}) &bull; {profile?.department}
              </span>
            </div>
            <span className="text-[10px] text-emerald-400 font-semibold bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              Verified Student ID
            </span>
          </div>

          {overlapWarning && (
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <span>{overlapWarning}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Step 1: Event Details & Dates */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Select Pre-Published Event (Optional)
                </label>
                <select
                  value={selectedEventId}
                  onChange={(e) => handleEventSelect(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">-- Choose from event directory or fill below --</option>
                  {eventsList.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.title} ({ev.category} - {new Date(ev.start_date).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Event Title <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. National Hackathon 2026"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Organizer Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. IEEE / ACM / IIT"
                    value={organizerName}
                    onChange={(e) => setOrganizerName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Category <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as EventCategory)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="Hackathon">Hackathon</option>
                    <option value="Workshop">Workshop</option>
                    <option value="Conference">Conference</option>
                    <option value="Coding Contest">Coding Contest</option>
                    <option value="Webathon">Webathon</option>
                    <option value="Symposium">Symposium</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Venue / Campus <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Campus Tech Auditorium"
                    value={venue}
                    onChange={(e) => setVenue(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    City / Location
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Bengaluru, Karnataka"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Start Date <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    End Date <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    OD Days Requested
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={odDaysRequested}
                    onChange={(e) => setOdDaysRequested(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Event Website or Registration URL
                </label>
                <div className="relative">
                  <Globe className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="url"
                    placeholder="https://eventwebsite.org"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Role, Team & Academic Purpose */}
          {step === 2 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Participation Role <span className="text-rose-400">*</span>
                </label>
                <select
                  value={eventRole}
                  onChange={(e) => setEventRole(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="Participant">Participant / Contestant</option>
                  <option value="Paper Presenter">Research Paper Presenter</option>
                  <option value="Team Lead">Team Lead</option>
                  <option value="Speaker">Keynote / Student Speaker</option>
                  <option value="Organizer">Student Organizer</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Team Name (if participating as team)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. ByteCraft Innovators"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Team Members (1 per line)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="John Doe (21CS105)&#10;Alice Smith (21IT102)"
                    value={teamMembersText}
                    onChange={(e) => setTeamMembersText(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Purpose & Expected Technical / Academic Benefit <span className="text-rose-400">*</span>
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Explain the technical problem you are solving, skills acquired, and how this participation aligns with departmental academic objectives..."
                  value={reasonStatement}
                  onChange={(e) => setReasonStatement(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500 leading-relaxed"
                />
              </div>
            </div>
          )}

          {/* Step 3: Supporting Document Vault Upload */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs">
                <p className="font-bold flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  Private Supporting Document Vault
                </p>
                <p className="mt-1 text-slate-400">
                  Upload your official acceptance letter, registration confirmation ticket, or conference invitation. Files are stored strictly in the private storage bucket with encrypted access tokens.
                </p>
              </div>

              <div className="border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-2xl p-6 text-center bg-slate-900/50 transition-colors">
                <input
                  type="file"
                  id="proof-file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleFileSelection}
                  className="hidden"
                />
                <label htmlFor="proof-file" className="cursor-pointer flex flex-col items-center justify-center gap-2">
                  <Upload className="w-8 h-8 text-indigo-400" />
                  <span className="text-sm font-semibold text-white">
                    {proofFile ? proofFile.name : 'Choose proof document (PDF, PNG, JPG)'}
                  </span>
                  <span className="text-xs text-slate-500">
                    Maximum file size: 5 MB. Both MIME type and extension are validated.
                  </span>
                </label>
              </div>

              {proofFile && (
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-slate-200 font-medium truncate max-w-xs">{proofFile.name}</span>
                    <span className="text-[10px] text-slate-500">
                      ({(proofFile.size / (1024 * 1024)).toFixed(2)} MB)
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                    Ready to Vault
                  </span>
                </div>
              )}

              {/* Review Summary */}
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs space-y-2">
                <h4 className="font-bold text-white mb-2">Application Summary Review</h4>
                <div className="flex justify-between text-slate-400">
                  <span>Event Title:</span>
                  <strong className="text-white">{eventTitle}</strong>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Dates & Days:</span>
                  <strong className="text-white">{startDate} to {endDate} ({odDaysRequested} OD Days)</strong>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Role:</span>
                  <strong className="text-white">{eventRole}</strong>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Venue:</span>
                  <strong className="text-white">{venue} {city && `(${city})`}</strong>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:px-8 border-t border-slate-800 flex items-center justify-between gap-3 bg-slate-950/80">
          <div>
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep(step - 1)}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handleSubmit(true)}
              disabled={isSubmitting || !eventTitle.trim()}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 transition-colors"
            >
              Save as Draft
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={handleNextStep}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-md shadow-indigo-600/30 active:scale-95"
              >
                Next Step
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleSubmit(false)}
                disabled={isSubmitting || !proofFile}
                className="px-6 py-2.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white flex items-center gap-2 shadow-lg shadow-emerald-600/30 active:scale-95"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {isUploading ? uploadProgress : 'Submitting to Proctor...'}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Submit Final OD Application
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OdRequestModal;
