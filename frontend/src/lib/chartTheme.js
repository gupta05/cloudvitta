// Shared Recharts theme. Recharts requires literal color values for SVG
// attributes, so the cv-* token hexes are mirrored here — keep in sync with
// the @theme block in src/index.css.

/** Categorical series palette (primary first, then distinct hues). */
export const CHART_COLORS = [
  '#3b82f6', // cv-primary
  '#22c55e', // cv-success
  '#8b5cf6', // cv-viz-purple
  '#f59e0b', // cv-warning
  '#ef4444', // cv-danger
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#a1a1aa', // cv-text-secondary
];

export const PRIMARY = '#3b82f6';        // cv-primary
export const PRIMARY_HOVER = '#60a5fa';  // cv-primary-hover
export const GRID_STROKE = '#27272a';    // cv-border
export const AXIS_STROKE = '#52525b';    // between border-light and text-muted

/** One tooltip style for every chart. */
export const TOOLTIP_STYLE = {
  background: '#18181b',                 // cv-surface
  border: '1px solid #27272a',           // cv-border
  borderRadius: '8px',
  color: '#fafafa',                      // cv-text
  fontSize: '0.8rem',
};
