import React from 'react';
import { Shield, Terminal } from 'lucide-react';

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-slate-900 bg-slate-950/80 py-8 text-xs text-slate-500">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-indigo-400" />
          <span>
            <strong className="text-slate-300 font-semibold">EventPass</strong> &bull; Technical Event Participation Approval & Attendance Monitoring System
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-indigo-400/90 font-mono text-[11px]">
            <Terminal className="w-3.5 h-3.5" />
            Pixel to Product 2026 Webathon
          </span>
          <span className="text-slate-700">|</span>
          <span className="text-slate-400">PostgreSQL RLS Hardened &bull; S3 Private Storage</span>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
