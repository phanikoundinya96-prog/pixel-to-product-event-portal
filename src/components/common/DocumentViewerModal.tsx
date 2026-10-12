import React, { useEffect, useState } from 'react';
import { getAuthorizedDocumentUrl } from '@/utils/documentVault';
import { X, Download, FileText, AlertCircle } from 'lucide-react';
import LoadingSpinner from '@/components/common/LoadingSpinner';

interface DocumentViewerModalProps {
  objectKey: string;
  title?: string;
  studentName?: string;
  onClose: () => void;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({
  objectKey,
  title = 'Proof Document',
  studentName,
  onClose,
}) => {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const fetchUrl = async () => {
      setLoading(true);
      setError(null);
      const res = await getAuthorizedDocumentUrl(objectKey);
      if (!active) return;

      if (res.error || !res.url) {
        setError(res.error || 'Failed to authorize document preview.');
      } else {
        setUrl(res.url);
      }
      setLoading(false);
    };

    fetchUrl();

    return () => {
      active = false;
    };
  }, [objectKey]);

  const isPdf = objectKey.toLowerCase().endsWith('.pdf');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="glass-panel rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col border border-slate-700 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:px-6 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-400" />
            <div>
              <h3 className="text-sm font-bold text-white">
                {title} {studentName ? `• ${studentName}` : ''}
              </h3>
              <p className="text-[11px] font-mono text-slate-400 truncate max-w-md">
                {objectKey}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                download
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 transition-colors"
                title="Download or open in new tab"
              >
                <Download className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 p-4 overflow-y-auto flex items-center justify-center min-h-[400px] bg-slate-950/60">
          {loading ? (
            <LoadingSpinner size="lg" label="Generating authorized viewing token from private vault..." />
          ) : error ? (
            <div className="p-6 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          ) : url ? (
            isPdf ? (
              <iframe
                src={url}
                title="PDF Document Preview"
                className="w-full h-[600px] rounded-xl border border-slate-800 bg-white"
              />
            ) : (
              <img
                src={url}
                alt="Document Preview"
                className="max-h-[600px] w-auto max-w-full rounded-xl object-contain border border-slate-800 shadow-md"
              />
            )
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default DocumentViewerModal;
