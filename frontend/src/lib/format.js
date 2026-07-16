// Shared value formatting (non-currency) for the whole app.
// Currency formatting lives in lib/currency.js — keep the two separate.

/** Format a byte count: 1536 -> "1.50 KB". 1024-based, B through PB. */
export function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(Math.abs(bytes)) / Math.log(k)));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

// One locale app-wide, matching the INR currency locale.
const LOCALE = 'en-IN';

const DATE_STYLES = {
  short: { day: 'numeric', month: 'short', year: 'numeric' },          // 16 Jul 2026
  long: { day: 'numeric', month: 'long', year: 'numeric' },            // 16 July 2026
  datetime: { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' },
  monthDay: { month: 'short', day: 'numeric' },                        // chart axes
};

/**
 * Format a date consistently across the app.
 * @param {string|number|Date} date
 * @param {'short'|'long'|'datetime'|'monthDay'} style
 */
export function formatDate(date, style = 'short') {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(LOCALE, DATE_STYLES[style] || DATE_STYLES.short);
}
