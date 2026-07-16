/**
 * Shared pill tab group.
 * tabs: [{ key, label, icon? }]
 */
export default function TabPills({ tabs, active, onChange }) {
  return (
    <div className="tab-group" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={`tab-pill ${active === t.key ? 'active' : ''}`}
        >
          {t.icon && <t.icon size={16} />}
          {t.label}
        </button>
      ))}
    </div>
  );
}
