import { AlertCircle, RefreshCw } from 'lucide-react';

/**
 * Reusable error banner for pages that fail to load data.
 * Shows an error message with an optional retry button.
 */
export default function ErrorBanner({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 animate-fade-in">
      <div className="glass-card p-8 max-w-md text-center border-cv-danger/30">
        <div className="w-12 h-12 rounded-xl mx-auto mb-4 flex items-center justify-center bg-red-500/10 border border-red-500/30">
          <AlertCircle size={24} className="text-cv-danger" />
        </div>
        <h3 className="text-lg font-semibold text-cv-text mb-2">Something went wrong</h3>
        <p className="text-sm text-cv-text-secondary mb-5">{message || 'An unexpected error occurred. Please try again.'}</p>
        {onRetry && (
          <button onClick={onRetry} className="btn btn-primary">
            <RefreshCw size={16} /> Try Again
          </button>
        )}
      </div>
    </div>
  );
}
