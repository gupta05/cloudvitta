// Accent name → token classes for the icon chip.
const ACCENTS = {
  primary: 'bg-cv-primary/10 border-cv-primary/25 text-cv-primary',
  success: 'bg-cv-success/10 border-cv-success/25 text-cv-success',
  warning: 'bg-cv-warning/10 border-cv-warning/25 text-cv-warning',
  danger: 'bg-cv-danger/10 border-cv-danger/25 text-cv-danger',
  purple: 'bg-cv-viz-purple/10 border-cv-viz-purple/25 text-cv-viz-purple',
  neutral: 'bg-cv-surface-3 border-cv-border text-cv-text-secondary',
};

/**
 * KPI/stat card: uppercase label, bold value, optional context line,
 * icon chip top-right, optional progress bar.
 * accent: 'primary' | 'success' | 'warning' | 'danger' | 'purple' | 'neutral'
 * progress: { percent, danger? } — renders an aria-annotated progress bar.
 */
export default function StatCard({ icon: Icon, label, value, subValue, accent = 'neutral', progress }) {
  const chip = ACCENTS[accent] || ACCENTS.neutral;
  return (
    <div className="glass-card p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-cv-text-muted uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-cv-text mt-1 truncate">{value}</p>
          {subValue && <p className="text-xs text-cv-text-secondary mt-1">{subValue}</p>}
        </div>
        {Icon && (
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center border shrink-0 ${chip}`}>
            <Icon size={20} />
          </div>
        )}
      </div>
      {progress && (
        <div
          className="mt-3 progress-bar"
          role="progressbar"
          aria-valuenow={Math.round(progress.percent)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${label}: ${Math.round(progress.percent)}%`}
        >
          <div
            className="progress-bar-fill"
            style={{
              width: `${Math.min(100, progress.percent)}%`,
              background: progress.danger ? 'var(--color-cv-danger)' : undefined,
            }}
          />
        </div>
      )}
    </div>
  );
}
