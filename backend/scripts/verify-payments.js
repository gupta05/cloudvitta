/**
 * One-shot verification for the Razorpay integration + transaction ledger.
 *
 * Usage (backend server must be running — `npm run dev:backend` in another terminal):
 *   node backend/scripts/verify-payments.js            # safe, non-mutating checks
 *   node backend/scripts/verify-payments.js --expiry   # also tests paid-period expiry
 *                                                      # (downgrades demo Acme sub — restore with `npm run db:seed`)
 */

import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const BASE = `http://localhost:${process.env.PORT || 3000}/api`;
const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
function ok(name, detail = '') {
  passed++;
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`);
}
function fail(name, detail = '') {
  failed++;
  console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  console.log('── 1. Database schema & seed ──────────────────────────');
  const [payCount, txnCount, wheCount] = await Promise.all([
    prisma.payment.count(),
    prisma.transaction.count(),
    prisma.paymentWebhookEvent.count(),
  ]);
  ok('New models queryable', `payments=${payCount} transactions=${txnCount} webhookEvents=${wheCount}`);

  const paidSub = await prisma.subscription.findFirst({
    where: { status: 'ACTIVE', currentPeriodEnd: { not: null } },
    include: { customer: true, planVersion: { include: { plan: true } } },
  });
  if (paidSub) ok('Seeded paid-period subscription', `${paidSub.customer.name} / ${paidSub.planVersion.plan.name} paid through ${paidSub.currentPeriodEnd.toISOString().slice(0, 10)}`);
  else fail('Seeded paid-period subscription', 'no ACTIVE sub with currentPeriodEnd — did db:seed run?');

  console.log('── 2. Module load (circular-import check) ─────────────');
  try {
    const m = await import('../src/services/paymentService.js');
    const lc = await import('../src/services/subscriptionLifecycle.js');
    if (typeof m.processSuccessfulPayment === 'function' && typeof lc.downgradeToFreePlan === 'function') {
      ok('paymentService ⇄ subscriptionLifecycle cycle resolves');
    } else fail('paymentService exports incomplete');
  } catch (e) {
    fail('Service module load', e.message);
  }

  console.log('── 3. Server reachability ─────────────────────────────');
  try {
    const h = await fetch(`${BASE}/health`);
    if (!h.ok) throw new Error(`status ${h.status}`);
    ok('Backend is up', BASE);
  } catch {
    console.log('  SKIP  Backend not running — start it with `npm run dev:backend`, then re-run this script.');
    console.log(`\nResult: ${passed} passed, ${failed} failed (API checks skipped)`);
    return;
  }

  console.log('── 4. Auth + plan discovery ───────────────────────────');
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'user@techstart.io', password: 'password123' }),
  });
  if (!loginRes.ok) {
    fail('Login as user@techstart.io', `status ${loginRes.status}`);
    console.log(`\nResult: ${passed} passed, ${failed} failed`);
    return;
  }
  const { token } = await loginRes.json();
  ok('Login as user@techstart.io (Free plan demo user)');
  const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const plansRes = await fetch(`${BASE}/portal/billing/plans`, { headers: auth });
  const plans = (await plansRes.json()).data || [];
  const paidPlan = plans.find((p) => (p.monthlyPrice || 0) > 0);
  if (paidPlan) ok('Paid plan found', `${paidPlan.name} ₹${paidPlan.monthlyPrice}/mo (versionId ${paidPlan.versionId})`);
  else fail('Paid plan found', 'no plan with monthlyPrice > 0');

  console.log('── 5. Payment-bypass guard (security invariant) ───────');
  if (paidPlan) {
    const bypass = await fetch(`${BASE}/portal/billing/subscribe`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ planVersionId: paidPlan.versionId }),
    });
    const body = await bypass.json().catch(() => ({}));
    if (bypass.status === 402 && body.requiresPayment) {
      ok('POST /subscribe with paid plan rejected', '402 requiresPayment — frontend can never activate Pro for free');
    } else {
      fail('POST /subscribe with paid plan rejected', `expected 402, got ${bypass.status} ${JSON.stringify(body)}`);
    }
  }

  console.log('── 6. Create-order behaviour ──────────────────────────');
  const configured = Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
  if (paidPlan) {
    const orderRes = await fetch(`${BASE}/portal/billing/payments/create-order`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ planVersionId: paidPlan.versionId }),
    });
    const orderBody = await orderRes.json().catch(() => ({}));
    if (!configured) {
      if (orderRes.status === 503) ok('create-order without keys', '503 gateway-not-configured (set RAZORPAY_KEY_ID/SECRET in backend/.env to enable checkout)');
      else fail('create-order without keys', `expected 503, got ${orderRes.status}`);
    } else if (orderRes.status === 201 && orderBody.orderId && orderBody.keyId && orderBody.amountCents === paidPlan.monthlyPrice * 100) {
      ok('create-order with keys', `order ${orderBody.orderId}, ${orderBody.amountCents} paise (₹${paidPlan.monthlyPrice}) — rupee→paise conversion correct`);
    } else {
      fail('create-order with keys', `status ${orderRes.status} ${JSON.stringify(orderBody)}`);
    }
  }

  console.log('── 7. Webhook signature enforcement ───────────────────');
  const badSig = await fetch(`${BASE}/payments/webhook/razorpay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'deadbeef', 'x-razorpay-event-id': 'evt_verify_bad' },
    body: JSON.stringify({ event: 'payment.captured' }),
  });
  if (badSig.status === 400) ok('Invalid webhook signature rejected', '400');
  else fail('Invalid webhook signature rejected', `expected 400, got ${badSig.status}`);

  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (webhookSecret) {
    const eventId = `evt_verify_${crypto.randomBytes(6).toString('hex')}`;
    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_verify_fake', order_id: 'order_verify_unknown', amount: 20000, method: 'card' } } },
    });
    const sig = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');
    const send = () => fetch(`${BASE}/payments/webhook/razorpay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': sig, 'x-razorpay-event-id': eventId },
      body: payload,
    });
    const first = await send();
    const firstBody = await first.json();
    if (first.status === 200 && firstBody.status === 'ok') ok('Valid-HMAC webhook accepted (unknown order safely ignored)');
    else fail('Valid-HMAC webhook accepted', `${first.status} ${JSON.stringify(firstBody)}`);

    const second = await send();
    const secondBody = await second.json();
    if (second.status === 200 && secondBody.status === 'duplicate') ok('Duplicate webhook deduplicated', 'event-id dedup layer works');
    else fail('Duplicate webhook deduplicated', `${second.status} ${JSON.stringify(secondBody)}`);
  } else {
    console.log('  SKIP  HMAC replay/dedup test — RAZORPAY_WEBHOOK_SECRET not set in backend/.env');
  }

  console.log('── 8. History endpoints (DB-driven) ───────────────────');
  const [payHist, txnHist] = await Promise.all([
    fetch(`${BASE}/portal/billing/payments`, { headers: auth }),
    fetch(`${BASE}/portal/billing/payments/transactions`, { headers: auth }),
  ]);
  const payHistBody = await payHist.json().catch(() => ({}));
  const txnHistBody = await txnHist.json().catch(() => ({}));
  if (payHist.status === 200 && Array.isArray(payHistBody.data)) ok('GET payment history', `${payHistBody.total} payment(s)`);
  else fail('GET payment history', `status ${payHist.status}`);
  if (txnHist.status === 200 && Array.isArray(txnHistBody.data)) ok('GET transaction ledger', `${txnHistBody.total} ledger row(s)`);
  else fail('GET transaction ledger', `status ${txnHist.status}`);

  if (process.argv.includes('--expiry')) {
    console.log('── 9. Paid-period expiry downgrade (MUTATES demo data) ─');
    const sub = await prisma.subscription.findFirst({
      where: { status: 'ACTIVE', currentPeriodEnd: { not: null } },
      include: { customer: true, planVersion: { include: { plan: true } } },
    });
    if (!sub) {
      fail('Expiry test', 'no active paid-period subscription to backdate');
    } else {
      const graceDays = Number(process.env.RENEWAL_GRACE_DAYS ?? 3);
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { currentPeriodEnd: new Date(Date.now() - (graceDays + 2) * 86400000) },
      });
      const { processPaidSubscriptionExpirations } = await import('../src/services/subscriptionLifecycle.js');
      const result = await processPaidSubscriptionExpirations(prisma);
      const ledgerRow = await prisma.transaction.findFirst({
        where: { subscriptionId: sub.id, type: 'SUBSCRIPTION_EXPIRED' },
      });
      const newSub = await prisma.subscription.findFirst({
        where: { customerId: sub.customerId, status: 'ACTIVE' },
        include: { planVersion: { include: { plan: true } } },
      });
      if (result.downgraded >= 1 && ledgerRow && newSub?.planVersion.plan.planType === 'FREE') {
        ok('Expiry downgrade', `${sub.customer.name}: ${sub.planVersion.plan.name} → ${newSub.planVersion.plan.name}, SUBSCRIPTION_EXPIRED ledger row written`);
      } else {
        fail('Expiry downgrade', `downgraded=${result.downgraded} ledger=${Boolean(ledgerRow)} newPlan=${newSub?.planVersion.plan.name}`);
      }
      console.log('  NOTE  Demo subscription was downgraded — run `npm run db:seed` to restore.');
    }
  }

  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error('Verification crashed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
