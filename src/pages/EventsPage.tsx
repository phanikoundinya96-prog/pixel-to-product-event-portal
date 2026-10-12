import React, { useEffect, useState } from 'react';
import insforge from '@/lib/insforge';
import { TechnicalEvent, EventCategory } from '@/types';
import { 
  Calendar, 
  MapPin, 
  Search, 
  Users, 
  Sparkles, 
  ArrowUpRight,
  Filter,
  AlertCircle
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
  const [error, setError] = useState<string | null>(null);

  const categories: (EventCategory | 'all')[] = [
    'all',
    'Hackathon',
    'Workshop',
    'Conference',
    'Coding Contest',
    'Webathon',
    'Symposium',
  ];

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

  const filteredEvents = events.filter((ev) => {
    const matchesSearch =
      ev.title.toLowerCase().includes(search.toLowerCase()) ||
      ev.description.toLowerCase().includes(search.toLowerCase()) ||
      ev.venue.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      selectedCategory === 'all' || ev.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="space-y-8 py-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-400 mb-2">
            <Sparkles className="w-3.5 h-3.5" />
            Verified Technical Directory
          </div>
          <h1 className="text-3xl font-extrabold text-white">Upcoming Technical Events</h1>
          <p className="text-sm text-slate-400 mt-1">
            Browse accredited college hackathons, conferences, and symposia eligible for OD approval.
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events, venue..."
            className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        <Filter className="w-4 h-4 text-slate-500 shrink-0 mr-1" />
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            {cat === 'all' ? 'All Categories' : cat}
          </button>
        ))}
      </div>

      {/* Content State */}
      {loading ? (
        <div className="py-20">
          <LoadingSpinner size="lg" label="Loading accredited technical events..." />
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
          <div className="w-12 h-12 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mx-auto mb-3">
            <Calendar className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">No technical events found</h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
            {search || selectedCategory !== 'all'
              ? 'Try adjusting your search terms or category filter.'
              : 'The event directory is currently fresh. The Technical Event In-Charge can publish upcoming events from the management console.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.map((ev) => (
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
                  <p className="text-xs text-slate-400 mt-1.5 line-clamp-2">
                    {ev.description}
                  </p>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800/80 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                    <span>{new Date(ev.start_date).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                    <span className="truncate">{ev.venue}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    <span>Max: {ev.max_participants} participants</span>
                  </div>
                </div>
              </div>

              <div className="pt-6 mt-4 border-t border-slate-800/80 flex items-center justify-between gap-3">
                <button
                  onClick={() => onApply(ev)}
                  className="w-full py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center justify-center gap-1.5 shadow-md shadow-indigo-600/20 transition-all active:scale-95"
                >
                  Apply for OD / Approval
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EventsPage;
