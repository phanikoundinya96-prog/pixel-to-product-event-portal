import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Calendar, 
  QrCode, 
  ShieldCheck, 
  FileCheck2, 
  ArrowRight,
  Sparkles,
  GraduationCap
} from 'lucide-react';

interface HomePageProps {
  onNavigate: (view: string) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const { user, role } = useAuth();

  return (
    <div className="space-y-16 py-8">
      {/* Hero Section */}
      <section className="relative overflow-hidden rounded-3xl glass-panel p-8 sm:p-14 border border-indigo-500/20 shadow-2xl">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-3xl space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            Pixel to Product 2026 Webathon Finalist System
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.1]">
            Technical Event Participation Approval & Attendance Portal
          </h1>

          <p className="text-lg text-slate-300 leading-relaxed">
            Eliminate paper On-Duty (OD) slips, track attendance eligibility automatically, and verify participation with tamper-proof QR check-ins. Built with database-level security and strict role-based access.
          </p>

          <div className="pt-2 flex flex-wrap items-center gap-4">
            <button
              onClick={() => onNavigate('events')}
              className="px-6 py-3.5 rounded-xl text-sm font-bold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2 shadow-xl shadow-indigo-600/30 hover:shadow-indigo-500/50 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Calendar className="w-4 h-4" />
              Browse Technical Events
              <ArrowRight className="w-4 h-4 ml-1" />
            </button>

            {!user ? (
              <button
                onClick={() => onNavigate('auth')}
                className="px-6 py-3.5 rounded-xl text-sm font-bold bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 hover:border-slate-600 flex items-center gap-2 transition-all hover:scale-[1.02]"
              >
                Sign In / Student & Faculty Portal
              </button>
            ) : (
              <button
                onClick={() => {
                  if (role === 'incharge' || role === 'admin') onNavigate('incharge');
                  else if (role === 'proctor' || role === 'faculty') onNavigate('proctor');
                  else onNavigate('student');
                }}
                className="px-6 py-3.5 rounded-xl text-sm font-bold bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30 flex items-center gap-2 transition-all"
              >
                Go to My Dashboard
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Feature Grid */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card rounded-2xl p-6 border border-slate-800">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4">
            <FileCheck2 className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Automated OD Workflows</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Multi-stage traceable pipeline: Student submission &rarr; Proctor academic check &rarr; Technical Event In-Charge approval with full audit trail.
          </p>
        </div>

        <div className="glass-card rounded-2xl p-6 border border-slate-800">
          <div className="w-12 h-12 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400 mb-4">
            <GraduationCap className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Academic Attendance Imports</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Imports official departmental attendance logs, computes eligibility percentages, validates freshness, and enforces the minimum cutoff.
          </p>
        </div>

        <div className="glass-card rounded-2xl p-6 border border-slate-800">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mb-4">
            <QrCode className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">Dynamic QR Attendance</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            On-site attendance tracking with single-use session tokens, preventing fraudulent OD claims and ensuring genuine participation.
          </p>
        </div>
      </section>

      {/* Security Architecture Callout */}
      <section className="glass-panel rounded-2xl p-6 sm:p-8 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mt-1">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-base font-bold text-white">Database-Enforced Row Level Security (RLS)</h4>
            <p className="text-sm text-slate-400 mt-1">
              All 11 database tables, private S3 storage buckets, and transition triggers are enforced directly at the PostgreSQL layer. Proctors cannot access unassigned student files.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end md:self-center font-mono text-xs px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          RLS Verified
        </div>
      </section>
    </div>
  );
};

export default HomePage;
