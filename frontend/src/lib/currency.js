// Shared currency formatting for the whole app (INR).
// Monetary amounts are stored as integers in the smallest currency unit
// (paise). Divide by 100 for whole-rupee display.
const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const inrWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Format an integer paise amount: 20000 -> "₹200.00" */
export function formatCurrency(paise) {
  return inr.format((paise || 0) / 100);
}

/** Format a whole-rupee amount (plan JSON prices, charge totals): 200 -> "₹200" */
export function formatRupees(amount) {
  return inrWhole.format(amount || 0);
}

export const CURRENCY_SYMBOL = '₹';
export const DEFAULT_CURRENCY = 'INR';
