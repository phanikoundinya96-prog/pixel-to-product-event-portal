import React from 'react';
import { RequestStatus, EligibilityStatus } from '@/types';

interface BadgeProps {
  status: RequestStatus | EligibilityStatus | string;
  size?: 'sm' | 'md';
}

export const Badge: React.FC<BadgeProps> = ({ status, size = 'md' }) => {
  const getStyle = (val: string) => {
    switch (val) {
      case 'approved':
      case 'approved_by_incharge':
      case 'eligible':
      case 'completed':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30';
      
      case 'recommended_by_proctor':
      case 'approved_faculty':
      case 'conditionally_eligible':
        return 'bg-sky-500/10 text-sky-400 border-sky-500/30';

      case 'pending_proctor':
      case 'pending_faculty':
      case 'pending_incharge':
      case 'submitted':
      case 'processing':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/30';

      case 'returned_for_correction':
      case 'changes_requested':
        return 'bg-orange-500/10 text-orange-400 border-orange-500/30';

      case 'rejected':
      case 'rejected_by_proctor':
      case 'rejected_by_incharge':
      case 'ineligible':
      case 'failed':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/30';

      case 'stale_data':
      case 'missing_data':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/30';

      case 'draft':
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const formatText = (val: string) => {
    return val.replace(/_/g, ' ').toUpperCase();
  };

  const sizeClass = size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1';

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full border ${sizeClass} ${getStyle(
        status
      )}`}
    >
      {formatText(status)}
    </span>
  );
};

export default Badge;
