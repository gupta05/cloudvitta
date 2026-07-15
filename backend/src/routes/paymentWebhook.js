/**
 * Razorpay Webhook Endpoint (PUBLIC — authenticated by HMAC signature, not JWT).
 *
 * Mounted in server.js BEFORE the global express.json() so the raw request body
 * is available for signature verification (a parsed body can never be reliably
 * re-serialized to the exact bytes Razorpay signed).
 */

import express from 'express';
import { verifyWebhookSignature } from '../services/razorpayClient.js';
import {
  processSuccessfulPayment,
  processFailedPayment,
  processRefund,
} from '../services/paymentService.js';

const router = express.Router();

router.post('/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
  const prisma = req.app.locals.prisma;
  const signature = req.headers['x-razorpay-signature'];
  const eventId = req.headers['x-razorpay-event-id'];

  if (!Buffer.isBuffer(req.body) || !signature || !verifyWebhookSignature(req.body, signature)) {
    console.warn('[Payments] Webhook signature verification FAILED');
    return res.status(400).json({ error: 'Invalid webhook signature' });
  }

  let event;
  try {
    event = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid webhook payload' });
  }

  // Dedup on Razorpay's event id: a duplicate delivery short-circuits unless the
  // previous attempt errored (then we let Razorpay's retry reprocess it).
  let eventRow = null;
  if (eventId) {
    try {
      eventRow = await prisma.paymentWebhookEvent.create({
        data: {
          razorpayEventId: eventId,
          eventType: event.event || 'unknown',
          payload: req.body.toString('utf8'),
          status: 'PROCESSING',
        },
      });
    } catch (err) {
      if (err.code === 'P2002') {
        const existing = await prisma.paymentWebhookEvent.findUnique({ where: { razorpayEventId: eventId } });
        if (existing && existing.status !== 'ERROR') {
          console.log(`[Payments] Duplicate webhook ${eventId} (${event.event}) — skipped`);
          return res.json({ status: 'duplicate' });
        }
        eventRow = await prisma.paymentWebhookEvent.update({
          where: { razorpayEventId: eventId },
          data: { status: 'PROCESSING', error: null },
        });
      } else {
        throw err;
      }
    }
  }

  console.log(`[Payments] Webhook received: ${event.event} (event id ${eventId || 'n/a'})`);

  try {
    switch (event.event) {
      case 'payment.captured': {
        const entity = event.payload?.payment?.entity;
        if (!entity?.order_id) throw new Error('Malformed payment.captured payload');
        await processSuccessfulPayment(prisma, {
          razorpayOrderId: entity.order_id,
          razorpayPaymentId: entity.id,
          gatewayPayload: entity,
          source: 'webhook',
        });
        break;
      }
      case 'payment.failed': {
        const entity = event.payload?.payment?.entity;
        if (!entity?.order_id) throw new Error('Malformed payment.failed payload');
        await processFailedPayment(prisma, {
          razorpayOrderId: entity.order_id,
          razorpayPaymentId: entity.id,
          errorCode: entity.error_code || null,
          errorDescription: entity.error_description || null,
          gatewayPayload: entity,
          source: 'webhook',
        });
        break;
      }
      case 'refund.processed': {
        const entity = event.payload?.refund?.entity;
        if (!entity?.payment_id) throw new Error('Malformed refund.processed payload');
        await processRefund(prisma, {
          razorpayPaymentId: entity.payment_id,
          razorpayRefundId: entity.id,
          amountCents: Number(entity.amount),
          gatewayPayload: entity,
        });
        break;
      }
      default:
        console.log(`[Payments] Unhandled webhook event: ${event.event}`);
    }

    if (eventRow) {
      await prisma.paymentWebhookEvent.update({
        where: { id: eventRow.id },
        data: { status: 'PROCESSED' },
      });
    }
    return res.json({ status: 'ok' });
  } catch (err) {
    console.error(`[Payments] Webhook processing error for ${event.event}:`, err.message);
    if (eventRow) {
      await prisma.paymentWebhookEvent
        .update({ where: { id: eventRow.id }, data: { status: 'ERROR', error: err.message } })
        .catch(() => {});
    }
    // 500 → Razorpay retries; the ERROR-status row permits reprocessing.
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export default router;
