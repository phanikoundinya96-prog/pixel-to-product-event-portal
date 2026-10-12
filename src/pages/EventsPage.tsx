import React, { useEffect, useState } from 'react';
import insforge from '@/lib/insforge';
import { TechnicalEvent, EventCategory, EventMode } from '@/types';
import { 
  Calendar, 
  MapPin, 
  Search, 
  Sparkles, 
  ArrowUpRight, 
  Filter, 
  AlertCircle,
  Clock,
  Building,
  Info,
  X
} from 'lucide-react';
import LoadingSpinner from '@/components/common/LoadingSpinner';

interface EventsPageProps {
  onApply: (event: TechnicalEvent) => void;
}

export const EventsPage: React.FC<EventsPageProps> = ({ onApply }) => {
  const [events, setEvents] = useState<TechnicalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedMode, setSelectedMode] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [activeEventDetail, setActiveEventDetail] = useState<TechnicalEvent | null>(null);

  const categories: (EventCategory | 'all')[] = [
    'all',
    'Hackathon',
    'Workshop',
    'Conference',
    'Coding Contest',
    'Webathon',
    'Symposium',
  ];

  const modes: (EventMode | 'all')[] = ['all', 'In-Person', 'Online', 'Hybrid'];

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await insforge.database
        .from('events')
        .select('*')
        .order('start_date', { ascending: true });

      if (err) {
        setError(err.message || 'Failed to fetch technical events.');
      } else {
        setEvents((data as TechnicalEvent[]) || []);
      }
    } catch (err: any) {
      setError(err?.message || 'Unexpected network error fetching events.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const now = new Date();

  const filteredEvents = events.filter((ev) => {
    const matchesSearch =
      ev.title.toLowerCase().includes(search.toLowerCase()) ||
      ev.organizer_name.toLowerCase().includes(search.toLowerCase()) ||
      ev.description.toLowerCase().includes(search.toLowerCase()) ||
      ev.venue.toLowerCase().includes(search.toLowerCase());
    
    const matchesCategory =
      selectedCategory === 'all' || ev.category === selectedCategory;

    const matchesMode =
      selectedMode === 'all' || ev.event_mode === selectedMode;

    return matchesSearch && matchesCategory && matchesMode;
  });

  const isDeadlinePassed = (deadlineStr?: string | null) => {
    if (!deadlineStr) return false;
    return new Date(deadlineStr) < now;
  };

  return (
    <div className="space-y-8 py-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            Accredited Technical Directory
          </div>
          <h1 className="text-3xl font-extrabold text-white">Upcoming & Ongoing Technical Events</h1>
          <p className="text-sm text-slate-400 mt-1">
            Browse verified college hackathons, conferences, and competitions eligible for official On-Duty (OD) sanction.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, organizer, venue..."
            className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Filters Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 py-2 border-y border-slate-800/80">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-none">
          <Filter className="w-3.5 h-3.5 text-slate-500 shrink-0 mr-1" />
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? 'bg-indigo-600 text-white shadow-md'
                  : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
              }`}
            >
              {cat === 'all' ? 'All Categories' : cat}
            </button>
          ))}
        </div>

        {/* Mode Selector */}
        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
          <span className="text-xs text-slate-500 font-medium">Mode:</span>
          {modes.map((m) => (
            <button
              key={m}
              onClick={() => setSelectedMode(m)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                selectedMode === m
                  ? 'bg-slate-800 text-indigo-400 border border-indigo-500/40'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {m === 'all' ? 'Any' : m}
            </button>
          ))}
        </div>
      </div>

      {/* Content State */}
      {loading ? (
        <div className="py-24">
          <LoadingSpinner size="lg" label="Synchronizing accredited technical events..." />
        </div>
      ) : error ? (
        <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold">Failed to load events</p>
            <p className="text-xs text-rose-400/90 mt-1">{error}</p>
            <button
              onClick={fetchEvents}
              className="mt-3 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/40"
            >
              Retry
            </button>
          </div>
        </div>
      ) : filteredEvents.length === 0 ? (
        <div className="text-center py-20 glass-panel rounded-3xl border border-slate-800">
          <Calendar className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-bold text-white">No matching technical events</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            {search || selectedCategory !== 'all' || selectedMode !== 'all'
              ? 'Try adjusting your search terms or filters.'
              : 'No technical events published in the institutional registry.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.map((ev) => {
            const deadlinePassed = isDeadlinePassed(ev.registration_deadline);

            return (
              <div
                key={ev.id}
                className="glass-card rounded-2xl p-6 border border-slate-800 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                      {ev.category}
                    </span>
                    <span className="text-xs font-medium text-slate-400 flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      {ev.event_mode}
                    </span>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-white group-hover:text-indigo-300 transition-colors">
                      {ev.title}
                    </h3>
                    <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                      <Building className="w-3.5 h-3.5 text-slate-500" />
                      {ev.organizer_name}
                    </p>
                    <p className="text-xs text-slate-400 mt-2 line-clamp-2">
                      {ev.description}
                    </p>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-slate-800/80 text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                      <span>
                        {new Date(ev.start_date).toLocaleDateString(undefined, { dateStyle: 'medium' })} &ndash;{' '}
                        {new Date(ev.end_date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-500" />
                      <span className="truncate">{ev.venue}</span>
                    </div>

                    {ev.registration_deadline && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span className={deadlinePassed ? 'text-rose-400 font-semibold' : 'text-slate-400'}>
                          Deadline: {new Date(ev.registration_deadline).toLocaleDateString()}
                          {deadlinePassed && ' (Passed)'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="pt-6 mt-4 border-t border-slate-800/80 flex items-center gap-2">
                  <button
                    onClick={() => setActiveEventDetail(ev)}
                    className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 text-xs font-semibold"
                    title="View Full Event Details"
                  >
                    <Info className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onApply(ev)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 shadow-md transition-all active:scale-95 ${
                      deadlinePassed
                        ? 'bg-amber-600/80 hover:bg-amber-600 text-white shadow-amber-600/20'
                        : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/20'
                    }`}
                  >
                    {deadlinePassed ? 'Apply (Late Exception)' : 'Apply for OD / Approval'}
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Event Details Modal */}
      {activeEventDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="glass-panel rounded-3xl max-w-xl w-full border border-slate-700 shadow-2xl p-6 sm:p-8 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">
                  {activeEventDetail.category} &bull; {activeEventDetail.event_mode}
                </span>
                <h2 className="text-xl font-bold text-white mt-2">
                  {activeEventDetail.title}
                </h2>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5">
                  <Building className="w-3.5 h-3.5" />
                  Organizer: <strong className="text-slate-200">{activeEventDetail.organizer_name}</strong>
                </p>
              </div>

              <button
                onClick={() => setActiveEventDetail(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed bg-slate-900/60 p-4 rounded-2xl border border-slate-800">
              {activeEventDetail.description}
            </p>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase font-semibold">Start & End Date</span>
                <p className="text-white font-medium mt-1">
                  {new Date(activeEventDetail.start_date).toLocaleDateString()} to {new Date(activeEventDetail.end_date).toLocaleDateString()}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase font-semibold">Venue</span>
                <p className="text-white font-medium mt-1 truncate">
                  {activeEventDetail.venue}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase font-semibold">Registration Deadline</span>
                <p className={`font-medium mt-1 ${isDeadlinePassed(activeEventDetail.registration_deadline) ? 'text-rose-400' : 'text-white'}`}>
                  {activeEventDetail.registration_deadline
                    ? new Date(activeEventDetail.registration_deadline).toLocaleDateString()
                    : 'Open'}
                  {isDeadlinePassed(activeEventDetail.registration_deadline) && ' (Closed)'}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                <span className="text-[10px] text-slate-500 uppercase font-semibold">Capacity</span>
                <p className="text-white font-medium mt-1">
                  {activeEventDetail.max_participants} Participants Max
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setActiveEventDetail(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Close
              </button>

              <button
                onClick={() => {
                  const ev = activeEventDetail;
                  setActiveEventDetail(null);
                  onApply(ev);
                }}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-md shadow-indigo-600/30"
              >
                Apply for OD
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventsPage;
