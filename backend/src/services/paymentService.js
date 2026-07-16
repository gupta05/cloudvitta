/**
 * Payment Service — Razorpay order lifecycle + idempotent subscription activation.
 *
 * Security invariant: a paid subscription is ONLY activated here, after backend
 * verification (checkout signature via /verify, or webhook HMAC). The frontend
 * alone can never upgrade a plan.
 *
 * Idempotency: processSuccessfulPayment claims the Payment row with an atomic
 * compare-and-swap (updateMany guarded by status). The browser verify call and
 * the payment.captured webhook can race — exactly one caller wins the claim and
 * performs activation; the loser sees count=0 and returns alreadyProcessed.
 */

import { ApiError } from '../utils/errors.js';
import { getRazorpay, getKeyId, isRazorpayConfigured } from './razorpayClient.js';
import { recordTransaction, TXN } from './ledger.js';
import { generateInvoiceForSubscription } from './billing.js';
import { downgradeToFreePlan } from './subscriptionLifecycle.js';
// Circular import (billingCycles ← paymentService helpers) is safe: both sides
// only call the other's hoisted function declarations at runtime.
import { finalizeMeteredCycleNow } from './billingCycles.js';

/**
 * Sum of flat-model price components, converted rupees → paise exactly once.
 * Pro = 20000 paise (₹200); Free = 0.
 */
export function computePlanChargeCents(planVersion) {
  let cents = 0;
  for (const pc of planVersion.priceComponents || []) {
    const pricing = JSON.parse(pc.pricingModel || '{}');
    if (pricing.model === 'flat') {
      cents += Math.round((pricing.price || 0) * 100);
    }
  }
  return cents;
}

export function addBillingPeriod(date, billingPeriod) {
  const next = new Date(date);
  switch (billingPeriod) {
    case 'QUARTERLY': next.setMonth(next.getMonth() + 3); break;
    case 'ANNUAL': next.setFullYear(next.getFullYear() + 1); break;
    case 'MONTHLY':
    default: next.setMonth(next.getMonth() + 1); break;
  }
  return next;
}

/**
 * Notify all portal users of a customer (webhook context has no req.user).
 */
export async function notifyCustomerUsers(prisma, customerId, { type = 'billing', title, message, metadata = {} }) {
  try {
    const users = await prisma.user.findMany({ where: { customerId, role: 'user' } });
    if (users.length === 0) return;
    await prisma.notification.createMany({
      data: users.map((u) => ({
        userId: u.id,
        type,
        title,
        message,
        metadata: JSON.stringify(metadata),
      })),
    });
  } catch (err) {
    console.error('[Payments] Notification creation failed:', err.message);
  }
}

/**
 * Create a Razorpay order + local Payment row (status CREATED).
 *
 * Purposes:
 *   subscription_purchase — upfront plan purchase (flat charge, prepaid plans)
 *   renewal               — extend an existing paid subscription
 *   invoice_payment       — pay an open (FINALIZED/OVERDUE) invoice, e.g. a
 *                           metered arrears invoice. Amount = amountDueCents.
 */
export async function createPaymentOrder(prisma, {
  tenantId,
  customerId,
  planVersionId,
  purpose = 'subscription_purchase',
  subscriptionId = null,
  invoiceId = null,
}) {
  if (!isRazorpayConfigured()) {
    throw new ApiError(503, 'Payment gateway is not configured');
  }
  if (!['subscription_purchase', 'renewal', 'invoice_payment'].includes(purpose)) {
    throw new ApiError(400, 'Invalid payment purpose');
  }

  // ── Invoice payment: amount comes from the invoice, not the plan ──
  if (purpose === 'invoice_payment') {
    if (!invoiceId) throw new ApiError(400, 'invoiceId is required for invoice payment');
    const invoice = await prisma.invoice.findFirst({
      where: { id: invoiceId, tenantId, customerId },
      include: { subscription: { include: { planVersion: { include: { plan: true } } } } },
    });
    if (!invoice) throw new ApiError(404, 'Invoice not found');
    if (!['FINALIZED', 'OVERDUE'].includes(invoice.status)) {
      throw new ApiError(400, `Invoice is ${invoice.status} and cannot be paid`);
    }
    if (invoice.amountDueCents <= 0) {
      throw new ApiError(400, 'Invoice has no amount due');
    }

    let order;
    try {
      order = await getRazorpay().orders.create({
        amount: invoice.amountDueCents, // paise
        currency: invoice.currency || 'INR',
        receipt: `cv_${Date.now()}_${customerId.slice(0, 8)}`,
        payment_capture: 1,
        notes: { tenantId, customerId, invoiceId, purpose },
      });
    } catch (err) {
      console.error('[Payments] Razorpay order creation failed:', err.error?.description || err.message);
      throw new ApiError(502, 'Failed to create payment order with the gateway');
    }

    const payment = await prisma.payment.create({
      data: {
        tenantId,
        customerId,
        invoiceId: invoice.id,
        subscriptionId: invoice.subscriptionId,
        planVersionId: invoice.subscription?.planVersionId || null,
        purpose,
        razorpayOrderId: order.id,
        amountCents: invoice.amountDueCents,
        currency: invoice.currency || 'INR',
        status: 'CREATED',
      },
    });

    console.log(`[Payments] Order created ${order.id} (₹${(invoice.amountDueCents / 100).toFixed(2)}, invoice ${invoice.invoiceNumber}) for customer ${customerId}`);

    return {
      payment,
      order,
      keyId: getKeyId(),
      planName: invoice.subscription?.planVersion?.plan?.name || 'Invoice',
      invoiceNumber: invoice.invoiceNumber,
    };
  }

  if (!planVersionId) {
    throw new ApiError(400, 'planVersionId is required');
  }

  const planVersion = await prisma.planVersion.findUnique({
    where: { id: planVersionId },
    include: { plan: true, priceComponents: true },
  });
  if (!planVersion || !planVersion.isActive || planVersion.plan.status !== 'ACTIVE') {
    throw new ApiError(404, 'Plan not found or not available');
  }

  const amountCents = computePlanChargeCents(planVersion);
  if (amountCents <= 0) {
    throw new ApiError(400, 'This plan is free and does not require payment');
  }

  if (purpose === 'renewal') {
    if (!subscriptionId) throw new ApiError(400, 'subscriptionId is required for renewal');
    const sub = await prisma.subscription.findFirst({
      where: { id: subscriptionId, tenantId, customerId, status: 'ACTIVE' },
    });
    if (!sub) throw new ApiError(404, 'Active subscription not found for renewal');
    if (sub.planVersionId !== planVersionId) {
      throw new ApiError(400, 'Renewal plan does not match the subscription plan');
    }
  }

  let order;
  try {
    order = await getRazorpay().orders.create({
      amount: amountCents, // paise
      currency: planVersion.currency || 'INR',
      receipt: `cv_${Date.now()}_${customerId.slice(0, 8)}`,
      payment_capture: 1,
      notes: { tenantId, customerId, planVersionId, purpose },
    });
  } catch (err) {
    console.error('[Payments] Razorpay order creation failed:', err.error?.description || err.message);
    throw new ApiError(502, 'Failed to create payment order with the gateway');
  }

  const payment = await prisma.payment.create({
    data: {
      tenantId,
      customerId,
      planVersionId,
      subscriptionId: purpose === 'renewal' ? subscriptionId : null,
      purpose,
      razorpayOrderId: order.id,
      amountCents,
      currency: planVersion.currency || 'INR',
      status: 'CREATED',
    },
  });

  console.log(`[Payments] Order created ${order.id} (₹${(amountCents / 100).toFixed(2)}, ${purpose}) for customer ${customerId}`);

  return {
    payment,
    order,
    keyId: getKeyId(),
    planName: planVersion.plan.name,
  };
}

/**
 * Idempotent capture handler — called from both the verify endpoint and the
 * payment.captured webhook. Exactly one caller activates the subscription.
 */
export async function processSuccessfulPayment(prisma, {
  razorpayOrderId,
  razorpayPaymentId,
  razorpaySignature = null,
  gatewayPayload = null,
  source, // 'verify' | 'webhook'
}) {
  const payment = await prisma.payment.findUnique({ where: { razorpayOrderId } });
  if (!payment) {
    console.warn(`[Payments] Capture for unknown order ${razorpayOrderId} (source=${source}) — ignoring`);
    return { payment: null, subscription: null, invoice: null, alreadyProcessed: false, unknownOrder: true };
  }

  // Verify path only carries ids + signature; fetch the payment entity from
  // Razorpay so gatewayResponse/method/amount come from a trusted server call.
  if (!gatewayPayload && isRazorpayConfigured()) {
    try {
      gatewayPayload = await getRazorpay().payments.fetch(razorpayPaymentId);
    } catch (err) {
      console.warn(`[Payments] Could not fetch payment ${razorpayPaymentId} from gateway:`, err.error?.description || err.message);
    }
  }

  // Atomic claim: only one of {verify, webhook} wins. FAILED/CANCELLED are
  // claimable — a first attempt can fail and a later attempt capture.
  const claimed = await prisma.payment.updateMany({
    where: { id: payment.id, status: { in: ['CREATED', 'FAILED', 'CANCELLED'] } },
    data: {
      status: 'CAPTURED',
      razorpayPaymentId,
      razorpaySignature: razorpaySignature || undefined,
      method: gatewayPayload?.method || undefined,
      gatewayResponse: JSON.stringify(gatewayPayload || {}),
      capturedAt: new Date(),
      errorCode: null,
      errorDescription: null,
    },
  });

  if (claimed.count === 0) {
    console.log(`[Payments] Duplicate capture skipped for ${razorpayOrderId} (source=${source})`);
    const current = await prisma.payment.findUnique({ where: { razorpayOrderId } });
    const subscription = current?.subscriptionId
      ? await prisma.subscription.findUnique({
          where: { id: current.subscriptionId },
          include: { planVersion: { include: { plan: true } } },
        })
      : null;
    return { payment: current, subscription, invoice: null, alreadyProcessed: true };
  }

  console.log(`[Payments] Captured ${razorpayPaymentId} (order ${razorpayOrderId}, source=${source})`);

  // Amount sanity check against the gateway entity (paise on both sides).
  if (gatewayPayload?.amount != null && Number(gatewayPayload.amount) !== payment.amountCents) {
    console.error(`[Payments] AMOUNT MISMATCH on ${razorpayPaymentId}: gateway=${gatewayPayload.amount} expected=${payment.amountCents} — activation skipped for manual review`);
    await recordTransaction(prisma, {
      tenantId: payment.tenantId,
      customerId: payment.customerId,
      type: TXN.PAYMENT_CAPTURED,
      direction: 'CREDIT',
      amountCents: Number(gatewayPayload.amount),
      description: `Payment captured with AMOUNT MISMATCH (expected ₹${(payment.amountCents / 100).toFixed(2)}) — subscription NOT activated`,
      paymentId: payment.id,
      metadata: { anomaly: 'amount_mismatch', expectedCents: payment.amountCents, receivedCents: Number(gatewayPayload.amount), source },
      idempotencyKey: `${payment.id}:PAYMENT_CAPTURED`,
    });
    const current = await prisma.payment.findUnique({ where: { razorpayOrderId } });
    return { payment: current, subscription: null, invoice: null, alreadyProcessed: false, amountMismatch: true };
  }

  // ── Invoice payment: settle the invoice, no subscription changes ──
  if (payment.purpose === 'invoice_payment') {
    const invoice = await settleInvoiceFromPayment(prisma, payment, { razorpayOrderId, razorpayPaymentId, gatewayPayload, source });
    const finalPayment = await prisma.payment.findUnique({ where: { razorpayOrderId } });
    return { payment: finalPayment, subscription: null, invoice, alreadyProcessed: false };
  }

  const { subscription, renewed, periodStart, periodEnd } = await activateOrRenewFromPayment(prisma, payment);

  // Ledger: money movement + subscription event.
  await recordTransaction(prisma, {
    tenantId: payment.tenantId,
    customerId: payment.customerId,
    type: TXN.PAYMENT_CAPTURED,
    direction: 'CREDIT',
    amountCents: payment.amountCents,
    description: `Payment captured via Razorpay (${gatewayPayload?.method || 'unknown method'}) — ${payment.purpose === 'renewal' ? 'subscription renewal' : 'plan purchase'}`,
    paymentId: payment.id,
    subscriptionId: subscription.id,
    metadata: { razorpayOrderId, razorpayPaymentId, source },
    idempotencyKey: `${payment.id}:PAYMENT_CAPTURED`,
  });
  await recordTransaction(prisma, {
    tenantId: payment.tenantId,
    customerId: payment.customerId,
    type: renewed ? TXN.SUBSCRIPTION_RENEWED : TXN.SUBSCRIPTION_ACTIVATED,
    description: renewed
      ? `${subscription.planVersion.plan.name} plan renewed — paid through ${subscription.currentPeriodEnd.toISOString().slice(0, 10)}`
      : `${subscription.planVersion.plan.name} plan activated after payment`,
    paymentId: payment.id,
    subscriptionId: subscription.id,
    idempotencyKey: `${payment.id}:SUBSCRIPTION`,
  });

  // Invoice: generated + marked PAID, linked to the payment. Failure here is
  // logged but never un-captures the payment or kills the subscription.
  // (INVOICE_GENERATED is recorded inside generateInvoiceForSubscription.)
  let invoice = null;
  try {
    invoice = await generateInvoiceForSubscription(prisma, subscription.id, payment.tenantId, periodStart, periodEnd);
    invoice = await prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: 'PAID', paidAt: new Date(), amountDueCents: 0 },
    });
    await prisma.payment.update({ where: { id: payment.id }, data: { invoiceId: invoice.id } });
    await recordTransaction(prisma, {
      tenantId: payment.tenantId,
      customerId: payment.customerId,
      type: TXN.INVOICE_PAID,
      description: `Invoice ${invoice.invoiceNumber} paid via Razorpay`,
      paymentId: payment.id,
      invoiceId: invoice.id,
      subscriptionId: subscription.id,
      idempotencyKey: `${invoice.id}:PAID`,
    });
  } catch (err) {
    console.error(`[Payments] Invoice generation failed for payment ${payment.id}:`, err.message);
  }

  notifyCustomerUsers(prisma, payment.customerId, {
    title: renewed ? 'Subscription renewed' : 'Payment successful — plan upgraded',
    message: renewed
      ? `Your ${subscription.planVersion.plan.name} plan has been renewed. Paid through ${subscription.currentPeriodEnd.toDateString()}.`
      : `Your payment of ₹${(payment.amountCents / 100).toFixed(2)} was successful. The ${subscription.planVersion.plan.name} plan is now active.`,
    metadata: { paymentId: payment.id, subscriptionId: subscription.id },
  }).catch(() => {});

  const finalPayment = await prisma.payment.findUnique({ where: { razorpayOrderId } });
  return { payment: finalPayment, subscription, invoice, alreadyProcessed: false };
}

/**
 * Winner-only settlement of an invoice_payment capture: mark the invoice PAID
 * and write the ledger rows. Never mutates the subscription — metered plans
 * stay ACTIVE throughout; paying simply clears the arrears invoice (and lifts
 * the overdue upload block, which is derived from invoice status).
 */
async function settleInvoiceFromPayment(prisma, payment, { razorpayOrderId, razorpayPaymentId, gatewayPayload, source }) {
  const now = new Date();

  await recordTransaction(prisma, {
    tenantId: payment.tenantId,
    customerId: payment.customerId,
    type: TXN.PAYMENT_CAPTURED,
    direction: 'CREDIT',
    amountCents: payment.amountCents,
    description: `Payment captured via Razorpay (${gatewayPayload?.method || 'unknown method'}) — invoice payment`,
    paymentId: payment.id,
    invoiceId: payment.invoiceId,
    subscriptionId: payment.subscriptionId,
    metadata: { razorpayOrderId, razorpayPaymentId, source },
    idempotencyKey: `${payment.id}:PAYMENT_CAPTURED`,
  });

  let invoice = null;
  if (payment.invoiceId) {
    // Status-guarded settle: only an open invoice transitions to PAID.
    const settled = await prisma.invoice.updateMany({
      where: { id: payment.invoiceId, status: { in: ['FINALIZED', 'OVERDUE'] } },
      data: { status: 'PAID', paidAt: now, amountDueCents: 0 },
    });
    invoice = await prisma.invoice.findUnique({ where: { id: payment.invoiceId } });

    if (settled.count > 0 && invoice) {
      await recordTransaction(prisma, {
        tenantId: payment.tenantId,
        customerId: payment.customerId,
        type: TXN.INVOICE_PAID,
        description: `Invoice ${invoice.invoiceNumber} paid via Razorpay`,
        paymentId: payment.id,
        invoiceId: invoice.id,
        subscriptionId: payment.subscriptionId,
        idempotencyKey: `${invoice.id}:PAID`,
      });

      notifyCustomerUsers(prisma, payment.customerId, {
        title: 'Invoice paid',
        message: `Your payment of ₹${(payment.amountCents / 100).toFixed(2)} for invoice ${invoice.invoiceNumber} was successful.${invoice.status === 'PAID' ? ' Any upload block from this invoice has been lifted.' : ''}`,
        metadata: { paymentId: payment.id, invoiceId: invoice.id },
      }).catch(() => {});
    }
  }

  return invoice;
}

/**
 * Winner-only activation transaction. All reads happen before the transaction;
 * the transaction itself is write-only (keeps SQLite lock time minimal).
 */
async function activateOrRenewFromPayment(prisma, payment) {
  const now = new Date();
  const planVersion = await prisma.planVersion.findUnique({
    where: { id: payment.planVersionId },
    include: { plan: true, priceComponents: true },
  });
  if (!planVersion) throw new Error(`Plan version ${payment.planVersionId} not found for payment ${payment.id}`);

  const existing = await prisma.subscription.findFirst({
    where: {
      tenantId: payment.tenantId,
      customerId: payment.customerId,
      status: { in: ['ACTIVE', 'TRIAL', 'PENDING'] },
    },
    include: { planVersion: { include: { plan: true, priceComponents: { include: { billableMetric: true } } } } },
  });

  // Renewal — explicit, or an ACTIVE sub already on this exact plan (handles
  // double-purchase from two tabs: the second capture extends the paid period).
  const isRenewal = payment.purpose === 'renewal'
    || (existing && existing.status === 'ACTIVE' && existing.planVersionId === payment.planVersionId && existing.currentPeriodEnd);

  if (isRenewal && existing) {
    const base = existing.currentPeriodEnd && existing.currentPeriodEnd > now ? existing.currentPeriodEnd : now;
    const newEnd = addBillingPeriod(base, planVersion.billingPeriod);
    const [subscription] = await prisma.$transaction([
      prisma.subscription.update({
        where: { id: existing.id },
        data: { status: 'ACTIVE', currentPeriodStart: base, currentPeriodEnd: newEnd },
        include: { planVersion: { include: { plan: true } } },
      }),
      prisma.payment.update({ where: { id: payment.id }, data: { subscriptionId: existing.id } }),
    ]);
    return { subscription, renewed: true, periodStart: base, periodEnd: newEnd };
  }

  const periodEnd = addBillingPeriod(now, planVersion.billingPeriod);

  // A metered subscription being replaced must be billed for its partial cycle
  // BEFORE it is ENDED (the invoice engine only bills ACTIVE/TRIAL subs).
  if (existing && existing.status === 'ACTIVE' && existing.planVersion?.plan?.planType === 'METERED') {
    await finalizeMeteredCycleNow(prisma, existing, 'Plan changed (paid upgrade)');
  }

  const subscription = await prisma.$transaction(async (tx) => {
    if (existing) {
      await tx.subscription.update({
        where: { id: existing.id },
        data: { status: 'ENDED', cancelledAt: now, cancelReason: 'Plan changed (paid upgrade)' },
      });
    }
    const sub = await tx.subscription.create({
      data: {
        tenantId: payment.tenantId,
        customerId: payment.customerId,
        planVersionId: payment.planVersionId,
        status: 'ACTIVE',
        billingStartDate: now,
        billingDay: now.getDate(),
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
      },
    });
    if (planVersion.priceComponents.length > 0) {
      await tx.subscriptionComponent.createMany({
        data: planVersion.priceComponents.map((pc) => ({ subscriptionId: sub.id, priceComponentId: pc.id })),
      });
    }
    await tx.payment.update({ where: { id: payment.id }, data: { subscriptionId: sub.id } });
    return tx.subscription.findUnique({
      where: { id: sub.id },
      include: { planVersion: { include: { plan: true } } },
    });
  });
  return { subscription, renewed: false, periodStart: now, periodEnd };
}

/**
 * Mark a payment FAILED (gateway decline) or CANCELLED (checkout dismissed).
 * Never regresses a CAPTURED payment.
 */
export async function processFailedPayment(prisma, {
  razorpayOrderId,
  razorpayPaymentId = null,
  errorCode = null,
  errorDescription = null,
  gatewayPayload = null,
  source,
  cancelled = false,
}) {
  const updated = await prisma.payment.updateMany({
    where: { razorpayOrderId, status: 'CREATED' },
    data: {
      status: cancelled ? 'CANCELLED' : 'FAILED',
      razorpayPaymentId: razorpayPaymentId || undefined,
      errorCode,
      errorDescription,
      gatewayResponse: gatewayPayload ? JSON.stringify(gatewayPayload) : undefined,
      failedAt: new Date(),
    },
  });
  if (updated.count === 0) {
    // Already captured/failed/cancelled — never regress.
    return { updated: false };
  }

  const payment = await prisma.payment.findUnique({ where: { razorpayOrderId } });
  console.log(`[Payments] Payment ${cancelled ? 'cancelled' : 'failed'} for order ${razorpayOrderId} (source=${source})${errorCode ? ` code=${errorCode}` : ''}`);

  if (!cancelled) {
    await recordTransaction(prisma, {
      tenantId: payment.tenantId,
      customerId: payment.customerId,
      type: TXN.PAYMENT_FAILED,
      amountCents: payment.amountCents,
      description: `Payment failed${errorDescription ? `: ${errorDescription}` : ''}`,
      paymentId: payment.id,
      metadata: { razorpayOrderId, errorCode, source },
      idempotencyKey: `${payment.id}:PAYMENT_FAILED`,
    });
    notifyCustomerUsers(prisma, payment.customerId, {
      title: 'Payment failed',
      message: `Your payment of ₹${(payment.amountCents / 100).toFixed(2)} could not be processed${errorDescription ? `: ${errorDescription}` : ''}. Your plan has not changed.`,
      metadata: { paymentId: payment.id },
    }).catch(() => {});
  }

  return { updated: true, payment };
}

/**
 * Handle refund.processed webhook. Full refund on an active subscription
 * downgrades the customer back to the Free plan.
 */
export async function processRefund(prisma, {
  razorpayPaymentId,
  razorpayRefundId,
  amountCents,
  gatewayPayload = null,
}) {
  const payment = await prisma.payment.findUnique({ where: { razorpayPaymentId } });
  if (!payment) {
    console.warn(`[Payments] Refund for unknown payment ${razorpayPaymentId} — ignoring`);
    return { updated: false };
  }

  const updated = await prisma.payment.updateMany({
    where: { id: payment.id, status: 'CAPTURED' },
    data: {
      status: 'REFUNDED',
      refundedCents: amountCents,
      razorpayRefundId,
      refundedAt: new Date(),
      gatewayResponse: gatewayPayload ? JSON.stringify(gatewayPayload) : undefined,
    },
  });
  if (updated.count === 0) {
    console.log(`[Payments] Duplicate/invalid refund skipped for ${razorpayPaymentId}`);
    return { updated: false };
  }

  console.log(`[Payments] Refunded ₹${(amountCents / 100).toFixed(2)} on payment ${razorpayPaymentId} (refund ${razorpayRefundId})`);

  await recordTransaction(prisma, {
    tenantId: payment.tenantId,
    customerId: payment.customerId,
    type: TXN.PAYMENT_REFUNDED,
    direction: 'DEBIT',
    amountCents,
    description: `Payment refunded via Razorpay (refund ${razorpayRefundId})`,
    paymentId: payment.id,
    subscriptionId: payment.subscriptionId,
    metadata: { razorpayPaymentId, razorpayRefundId },
    idempotencyKey: `${payment.id}:PAYMENT_REFUNDED`,
  });

  const isFullRefund = amountCents >= payment.amountCents;

  // Invoice payment refunded → the invoice is owed again. Reopen it as OVERDUE
  // (its due date has typically passed; the derived upload block re-engages).
  if (payment.purpose === 'invoice_payment' && payment.invoiceId) {
    if (isFullRefund) {
      const reopened = await prisma.invoice.updateMany({
        where: { id: payment.invoiceId, status: 'PAID' },
        data: { status: 'OVERDUE', paidAt: null, amountDueCents: payment.amountCents },
      });
      if (reopened.count > 0) {
        console.log(`[Payments] Invoice ${payment.invoiceId} reopened as OVERDUE after full refund`);
      }
    }
    notifyCustomerUsers(prisma, payment.customerId, {
      title: 'Payment refunded',
      message: `A refund of ₹${(amountCents / 100).toFixed(2)} has been processed.${isFullRefund ? ' The related invoice is due again.' : ''}`,
      metadata: { paymentId: payment.id, razorpayRefundId },
    }).catch(() => {});
    return { updated: true, payment };
  }

  if (isFullRefund && payment.subscriptionId) {
    const sub = await prisma.subscription.findUnique({
      where: { id: payment.subscriptionId },
      include: { planVersion: { include: { plan: true } } },
    });
    if (sub && sub.status === 'ACTIVE') {
      await downgradeToFreePlan(prisma, sub, 'Payment refunded', TXN.SUBSCRIPTION_CANCELLED);
    }
  }

  notifyCustomerUsers(prisma, payment.customerId, {
    title: 'Payment refunded',
    message: `A refund of ₹${(amountCents / 100).toFixed(2)} has been processed.${isFullRefund && payment.subscriptionId ? ' Your subscription has been moved to the Free plan.' : ''}`,
    metadata: { paymentId: payment.id, razorpayRefundId },
  }).catch(() => {});

  return { updated: true, payment };
}
