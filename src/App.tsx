import React, { useState } from 'react';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import HomePage from '@/pages/HomePage';
import EventsPage from '@/pages/EventsPage';
import AuthPage from '@/pages/AuthPage';
import StudentDashboard from '@/pages/student/StudentDashboard';
import ProctorDashboard from '@/pages/proctor/ProctorDashboard';
import InchargeDashboard from '@/pages/incharge/InchargeDashboard';
import { TechnicalEvent } from '@/types';
import { ShieldAlert } from 'lucide-react';

const AppContent: React.FC = () => {
  const { user, role } = useAuth();
  const [currentView, setCurrentView] = useState<string>('home');
  const [selectedEventForApply, setSelectedEventForApply] = useState<TechnicalEvent | null>(null);

  const handleApply = (event: TechnicalEvent) => {
    setSelectedEventForApply(event);
    if (!user) {
      setCurrentView('auth');
    } else {
      setCurrentView('student');
    }
  };

  const renderView = () => {
    switch (currentView) {
      case 'events':
        return <EventsPage onApply={handleApply} />;

      case 'auth':
        return (
          <AuthPage
            onSuccess={() => {
              if (role === 'incharge' || role === 'admin') setCurrentView('incharge');
              else if (role === 'proctor' || role === 'faculty') setCurrentView('proctor');
              else setCurrentView('student');
            }}
          />
        );

      case 'student':
        if (!user) {
          return (
            <div className="py-20 text-center glass-panel rounded-3xl max-w-md mx-auto p-8 border border-slate-800">
              <ShieldAlert className="w-12 h-12 text-amber-400 mx-auto mb-3" />
              <h2 className="text-lg font-bold text-white">Authentication Required</h2>
              <p className="text-xs text-slate-400 mt-2 mb-6">
                Please sign in with your student account to submit and monitor OD applications.
              </p>
              <button
                onClick={() => setCurrentView('auth')}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                Sign In
              </button>
            </div>
          );
        }
        return (
          <StudentDashboard
            initialEvent={selectedEventForApply}
            onNavigateToEvents={() => setCurrentView('events')}
          />
        );

      case 'proctor':
        if (!user || (role !== 'proctor' && role !== 'faculty' && role !== 'incharge' && role !== 'admin')) {
          return (
            <div className="py-20 text-center glass-panel rounded-3xl max-w-md mx-auto p-8 border border-slate-800">
              <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto mb-3" />
              <h2 className="text-lg font-bold text-white">Restricted Proctor Area</h2>
              <p className="text-xs text-slate-400 mt-2 mb-6">
                This dashboard requires Proctor or Faculty Advisor credentials.
              </p>
              <button
                onClick={() => setCurrentView('home')}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Return Home
              </button>
            </div>
          );
        }
        return <ProctorDashboard />;

      case 'incharge':
        if (!user || (role !== 'incharge' && role !== 'admin')) {
          return (
            <div className="py-20 text-center glass-panel rounded-3xl max-w-md mx-auto p-8 border border-slate-800">
              <ShieldAlert className="w-12 h-12 text-rose-400 mx-auto mb-3" />
              <h2 className="text-lg font-bold text-white">Restricted In-Charge Console</h2>
              <p className="text-xs text-slate-400 mt-2 mb-6">
                This console is strictly reserved for the Technical Event In-Charge.
              </p>
              <button
                onClick={() => setCurrentView('home')}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Return Home
              </button>
            </div>
          );
        }
        return <InchargeDashboard />;

      case 'home':
      default:
        return <HomePage onNavigate={(v) => setCurrentView(v)} />;
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar currentView={currentView} onNavigate={(v) => setCurrentView(v)} />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8">
        {renderView()}
      </main>
      <Footer />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
