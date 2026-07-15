/**
 * Financial Transaction Ledger Service
 *
 * The Transaction table is CloudVitta's immutable financial audit log: every
 * financial event (payment capture/failure/refund, subscription activation/
 * renewal/cancellation/expiry, invoice generation/payment, manual adjustments)
 * appends exactly one row. Rows are never updated or deleted by application code.
 *
 * All billing dashboards and history views read from these persisted records,
 * never from transient gateway responses.
 */

export const TXN = {
  PAYMENT_CAPTURED: 'PAYMENT_CAPTURED',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  PAYMENT_REFUNDED: 'PAYMENT_REFUNDED',
  SUBSCRIPTION_ACTIVATED: 'SUBSCRIPTION_ACTIVATED',
  SUBSCRIPTION_RENEWED: 'SUBSCRIPTION_RENEWED',
  SUBSCRIPTION_CANCELLED: 'SUBSCRIPTION_CANCELLED',
  SUBSCRIPTION_EXPIRED: 'SUBSCRIPTION_EXPIRED',
  INVOICE_GENERATED: 'INVOICE_GENERATED',
  INVOICE_PAID: 'INVOICE_PAID',
  CREDIT_ADJUSTMENT: 'CREDIT_ADJUSTMENT',
  DEBIT_ADJUSTMENT: 'DEBIT_ADJUSTMENT',
};

/**
 * Append a ledger entry.
 *
 * @param {object} db - PrismaClient or a $transaction tx client, so entries can
 *   join atomic blocks when needed.
 * @param {string|null} opts.idempotencyKey - unique key (e.g. "<paymentId>:PAYMENT_CAPTURED");
 *   a duplicate write is silently skipped (returns null) — this makes ledger writes
 *   safe under concurrent verify-endpoint + webhook processing.
 * @returns {Promise<object|null>} the created Transaction row, or null if deduped.
 */
export async function recordTransaction(db, {
  tenantId,
  customerId,
  type,
  direction = 'NEUTRAL',
  amountCents = 0,
  currency = 'INR',
  description,
  paymentId = null,
  invoiceId = null,
  subscriptionId = null,
  metadata = {},
  idempotencyKey = null,
}) {
  try {
    const txn = await db.transaction.create({
      data: {
        tenantId,
        customerId,
        type,
        direction,
        amountCents,
        currency,
        description,
        paymentId,
        invoiceId,
        subscriptionId,
        metadata: JSON.stringify(metadata),
        idempotencyKey,
      },
    });
    console.log(`[Ledger] ${type} ${direction} ₹${(amountCents / 100).toFixed(2)} customer=${customerId} — ${description}`);
    return txn;
  } catch (err) {
    if (err.code === 'P2002') {
      console.log(`[Ledger] Duplicate skipped: ${type} (key=${idempotencyKey})`);
      return null;
    }
    throw err;
  }
}
