import React, { useState } from 'react';
import insforge from '@/lib/insforge';
import { EventCategory, EventMode } from '@/types';
import { X, Calendar, AlertCircle } from 'lucide-react';

interface CreateEventModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateEventModal: React.FC<CreateEventModalProps> = ({ onClose, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<EventCategory>('Hackathon');
  const [organizerName, setOrganizerName] = useState('');
  const [organizerEmail, setOrganizerEmail] = useState('');
  const [venue, setVenue] = useState('');
  const [eventMode, setEventMode] = useState<EventMode>('In-Person');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [deadline, setDeadline] = useState('');
  const [maxParticipants, setMaxParticipants] = useState<number>(100);
  const [brochureFile, setBrochureFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title.trim() || !description.trim() || !venue.trim() || !startDate || !endDate) {
      setError('Please fill all mandatory fields.');
      return;
    }

    if (new Date(endDate) < new Date(startDate)) {
      setError('Event end date cannot be earlier than start date.');
      return;
    }

    setLoading(true);

    let brochureUrl: string | null = null;

    try {
      // Upload brochure to public event-docs bucket if provided
      if (brochureFile) {
        const ext = brochureFile.name.split('.').pop() || 'pdf';
        const key = `brochures/${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${ext}`;
        const { data: uploadData, error: uploadErr } = await insforge.storage
          .from('event-docs')
          .upload(key, brochureFile);

        if (uploadErr) {
          throw new Error(`Brochure upload failed: ${uploadErr.message}`);
        }

        if (uploadData) {
          const { data: publicUrlData } = insforge.storage
            .from('event-docs')
            .getPublicUrl(uploadData.key);
          brochureUrl = publicUrlData?.publicUrl || null;
        }
      }

      // Insert event into events table
      const { error: insertErr } = await insforge.database
        .from('events')
        .insert([
          {
            title,
            description,
            category,
            organizer_name: organizerName,
            organizer_email: organizerEmail || null,
            venue,
            event_mode: eventMode,
            start_date: new Date(startDate).toISOString(),
            end_date: new Date(endDate).toISOString(),
            registration_deadline: deadline ? new Date(deadline).toISOString() : null,
            max_participants: maxParticipants,
            brochure_url: brochureUrl,
            status: 'Upcoming',
            requires_od_approval: true,
          },
        ]);

      if (insertErr) {
        throw new Error(insertErr.message);
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to publish technical event.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass-panel rounded-3xl max-w-2xl w-full max-h-[92vh] flex flex-col border border-slate-700 shadow-2xl overflow-hidden">
        <div className="p-5 sm:px-8 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-extrabold text-white">Publish New Technical Event</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 p-5 sm:p-8 overflow-y-auto space-y-4">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Event Title <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. HackSprint 2026 Innovation Challenge"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
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

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Event Mode <span className="text-rose-400">*</span>
              </label>
              <select
                value={eventMode}
                onChange={(e) => setEventMode(e.target.value as EventMode)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                <option value="In-Person">In-Person</option>
                <option value="Online">Online</option>
                <option value="Hybrid">Hybrid</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Organizer Organization / Cell <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. IEEE / Innovation Cell"
                value={organizerName}
                onChange={(e) => setOrganizerName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Organizer Contact Email
              </label>
              <input
                type="email"
                placeholder="contact@organizer.org"
                value={organizerEmail}
                onChange={(e) => setOrganizerEmail(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Venue / Campus Location <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Main Auditorium, Tech Complex"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
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
              <label className="block text-xs font-semibold text-slate-300 mb-1">
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
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Registration Deadline
              </label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Max Participants
              </label>
              <input
                type="number"
                min="1"
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(parseInt(e.target.value) || 100)}
                className="w-full px-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Event Description & Objectives <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={3}
              required
              placeholder="Provide a summary of the technical event, tracks, evaluation criteria..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full p-3 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white focus:outline-none focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              Official Brochure / Pamphlet (PDF or Image)
            </label>
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              onChange={(e) => setBrochureFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-600/20 file:text-indigo-300 hover:file:bg-indigo-600/30"
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Uploaded brochures are stored in the public <code>event-docs</code> storage bucket for student access.
            </p>
          </div>

          <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white flex items-center gap-1.5 shadow-md shadow-indigo-600/20"
            >
              {loading ? 'Publishing...' : 'Publish Technical Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateEventModal;
