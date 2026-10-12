import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Calendar, 
  CheckCircle, 
  UserCheck, 
  ShieldCheck, 
  LogOut, 
  LogIn, 
  Award
} from 'lucide-react';

interface NavbarProps {
  currentView: string;
  onNavigate: (view: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentView, onNavigate }) => {
  const { user, profile, role, signOut } = useAuth();

  const getRoleBadge = (userRole: string | null) => {
    switch (userRole) {
      case 'student':
        return { label: 'Student', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' };
      case 'proctor':
      case 'faculty':
        return { label: 'Proctor / Faculty', color: 'bg-sky-500/10 text-sky-400 border-sky-500/30' };
      case 'incharge':
      case 'admin':
        return { label: 'Event In-Charge', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' };
      default:
        return { label: 'Guest', color: 'bg-slate-800 text-slate-400 border-slate-700' };
    }
  };

  const roleInfo = getRoleBadge(role);

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-slate-800/80">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div 
            onClick={() => onNavigate('home')} 
            className="flex items-center gap-3 cursor-pointer group"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-sky-400 p-0.5 shadow-lg shadow-indigo-500/20 group-hover:scale-105 transition-transform">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <Award className="w-5 h-5 text-indigo-400" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-indigo-200 bg-clip-text text-transparent">
                  EventPass
                </span>
                <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/30">
                  2026
                </span>
              </div>
              <p className="text-[11px] text-slate-400 tracking-wide">
                Pixel to Product Webathon
              </p>
            </div>
          </div>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-1">
            <button
              onClick={() => onNavigate('events')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                currentView === 'events'
                  ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Calendar className="w-4 h-4 text-indigo-400" />
              Technical Events
            </button>

            {user && (role === 'student' || !role) && (
              <button
                onClick={() => onNavigate('student')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  currentView === 'student'
                    ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                My OD & Approvals
              </button>
            )}

            {user && (role === 'proctor' || role === 'faculty' || role === 'incharge' || role === 'admin') && (
              <button
                onClick={() => onNavigate('proctor')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  currentView === 'proctor'
                    ? 'bg-sky-600/20 text-sky-300 border border-sky-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <UserCheck className="w-4 h-4 text-sky-400" />
                Proctor Review
              </button>
            )}

            {user && (role === 'incharge' || role === 'admin') && (
              <button
                onClick={() => onNavigate('incharge')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                  currentView === 'incharge'
                    ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                In-Charge Console
              </button>
            )}
          </nav>

          {/* User Section */}
          <div className="flex items-center gap-3">
            {user ? (
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <div className="flex items-center gap-2 justify-end">
                    <span className="text-xs font-semibold text-white">
                      {profile?.name || user.email?.split('@')[0]}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${roleInfo.color}`}>
                      {roleInfo.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {profile?.department || user.email}
                  </p>
                </div>

                <button
                  onClick={signOut}
                  title="Sign Out"
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-800 hover:border-rose-500/30 transition-all"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => onNavigate('auth')}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition-all active:scale-95"
              >
                <LogIn className="w-4 h-4" />
                Sign In / Register
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
