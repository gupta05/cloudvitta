/**
 * Portal Payment Routes — Razorpay checkout lifecycle for the customer portal.
 * Mounted at /api/portal/billing/payments.
 *
 * The verify endpoint is the trusted activation path: the backend recomputes the
 * checkout HMAC before any subscription change. The webhook (paymentWebhook.js)
 * is the redundant safety net for the same capture.
 */

import express from 'express';
import { authenticate, requireUser } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess } from '../middleware/tenantContext.js';
import { verifyCheckoutSignature } from '../services/razorpayClient.js';
import {
  createPaymentOrder,
  processSuccessfulPayment,
  processFailedPayment,
} from '../services/paymentService.js';

const router = express.Router();

router.use(authenticate, tenantContext, validateTenantAccess, requireUser);

/**
 * POST /create-order — create a Razorpay order for a paid plan purchase/renewal,
 * or for paying an open invoice (purpose 'invoice_payment' + invoiceId — used
 * by metered arrears invoices).
 */
router.post('/create-order', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { planVersionId, purpose, subscriptionId, invoiceId } = req.body;

    const { payment, order, keyId, planName, invoiceNumber } = await createPaymentOrder(prisma, {
      tenantId: req.tenantId,
      customerId: req.customerId,
      planVersionId,
      purpose: purpose || 'subscription_purchase',
      subscriptionId: subscriptionId || null,
      invoiceId: invoiceId || null,
    });

    const customer = await prisma.customer.findUnique({ where: { id: req.customerId } });

    res.status(201).json({
      orderId: order.id,
      amountCents: payment.amountCents,
      currency: payment.currency,
      keyId,
      planName,
      invoiceNumber: invoiceNumber || null,
      prefill: {
        name: customer?.name || '',
        email: req.user.email || customer?.email || '',
      },
      internalPaymentId: payment.id,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /verify — backend verification of the checkout success handler payload.
 * The subscription is only ever upgraded after this signature check passes
 * (or after the equivalent webhook HMAC check).
 */
router.post('/verify', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment verification fields' });
    }

    // Tenant isolation: the order must belong to this customer.
    const payment = await prisma.payment.findFirst({
      where: { razorpayOrderId: razorpay_order_id, tenantId: req.tenantId, customerId: req.customerId },
    });
    if (!payment) {
      return res.status(404).json({ error: 'Payment order not found' });
    }

    const valid = verifyCheckoutSignature({
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
    });
    if (!valid) {
      console.warn(`[Payments] Checkout signature verification FAILED for order ${razorpay_order_id} (customer ${req.customerId})`);
      return res.status(400).json({ error: 'Payment signature verification failed' });
    }

    const result = await processSuccessfulPayment(prisma, {
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      source: 'verify',
    });

    if (result.amountMismatch) {
      return res.status(409).json({ error: 'Payment amount mismatch — contact support', paymentId: result.payment?.id });
    }

    res.json({
      status: 'captured',
      alreadyProcessed: result.alreadyProcessed,
      subscription: result.subscription,
      invoiceId: result.invoice?.id || result.payment?.invoiceId || null,
      paymentId: result.payment?.id,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /failure — browser-reported checkout failure or dismissal.
 */
router.post('/failure', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { razorpay_order_id, code, description, cancelled } = req.body;

    if (!razorpay_order_id) {
      return res.status(400).json({ error: 'razorpay_order_id is required' });
    }

    const payment = await prisma.payment.findFirst({
      where: { razorpayOrderId: razorpay_order_id, tenantId: req.tenantId, customerId: req.customerId },
    });
    if (!payment) {
      return res.status(404).json({ error: 'Payment order not found' });
    }

    await processFailedPayment(prisma, {
      razorpayOrderId: razorpay_order_id,
      errorCode: code || null,
      errorDescription: description || null,
      source: 'checkout',
      cancelled: Boolean(cancelled),
    });

    res.json({ status: cancelled ? 'cancelled' : 'failed' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET / — payment history, served entirely from persisted DB records.
 */
router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { status } = req.query;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const where = {
      tenantId: req.tenantId,
      customerId: req.customerId,
      ...(status && { status }),
    };

    const [payments, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.payment.count({ where }),
    ]);

    // Attach plan names for display.
    const versionIds = [...new Set(payments.map((p) => p.planVersionId).filter(Boolean))];
    const versions = versionIds.length
      ? await prisma.planVersion.findMany({ where: { id: { in: versionIds } }, include: { plan: true } })
      : [];
    const planNameByVersion = Object.fromEntries(versions.map((v) => [v.id, v.plan.name]));

    res.json({
      data: payments.map((p) => ({ ...p, planName: planNameByVersion[p.planVersionId] || null })),
      total,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /transactions — the customer's financial transaction ledger.
 */
router.get('/transactions', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { type } = req.query;
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const where = {
      tenantId: req.tenantId,
      customerId: req.customerId,
      ...(type && { type }),
    };

    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.transaction.count({ where }),
    ]);

    res.json({ data: transactions, total });
  } catch (err) {
    next(err);
  }
});

export default router;
