/**
 * Standard empty state: dimmed icon, heading, message, optional CTA.
 * compact: smaller padding + icon for in-card / in-table use.
 */
export default function EmptyState({ icon: Icon, title, message, action, compact = false }) {
  return (
    <div className={`glass-card text-center ${compact ? 'p-8' : 'p-12'}`}>
      {Icon && <Icon size={compact ? 32 : 48} className="mx-auto mb-4 text-cv-text-muted opacity-30" />}
      {title && <h3 className="text-lg font-semibold text-cv-text mb-2">{title}</h3>}
      {message && <p className="text-sm text-cv-text-muted">{message}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
