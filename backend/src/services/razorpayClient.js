/**
 * Razorpay Client Service
 * Wraps the official Razorpay SDK + HMAC signature verification.
 *
 * All credentials come from environment variables (read at call time so that
 * migrating Test Mode → Live Mode is purely an env change):
 *   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
 */

import crypto from 'crypto';
import Razorpay from 'razorpay';

let instance = null;
let instanceKeyId = null;

export function isRazorpayConfigured() {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function getKeyId() {
  return process.env.RAZORPAY_KEY_ID;
}

export function getRazorpay() {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error('Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing)');
  }
  // Re-instantiate if keys change (e.g. test → live rotation without restart is not
  // expected, but this keeps the singleton consistent with the env).
  if (!instance || instanceKeyId !== keyId) {
    instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
    instanceKeyId = keyId;
  }
  return instance;
}

function timingSafeCompare(expectedHex, actualHex) {
  if (typeof actualHex !== 'string' || actualHex.length === 0) return false;
  const expected = Buffer.from(expectedHex, 'utf8');
  const actual = Buffer.from(actualHex, 'utf8');
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

/**
 * Verify the checkout-success signature returned to the browser:
 * HMAC-SHA256(`${order_id}|${payment_id}`, RAZORPAY_KEY_SECRET)
 */
export function verifyCheckoutSignature({ orderId, paymentId, signature }) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
  return timingSafeCompare(expected, signature);
}

/**
 * Verify a webhook delivery: HMAC-SHA256(rawBody, RAZORPAY_WEBHOOK_SECRET)
 * compared against the x-razorpay-signature header.
 */
export function verifyWebhookSignature(rawBody, signatureHeader) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return timingSafeCompare(expected, signatureHeader);
}
