/**
 * Post-upgrade database audit: dumps every payment, subscription, ledger row,
 * and invoice for the TechStart demo customer so the paid-upgrade flow can be
 * verified end-to-end from persisted records.
 *
 * Usage: node backend/scripts/audit-upgrade.js
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();
const rupees = (c) => `₹${(c / 100).toFixed(2)}`;

async function main() {
  const customer = await prisma.customer.findFirst({ where: { alias: 'techstart' } });
  if (!customer) throw new Error('TechStart customer not found');

  console.log('── Payments ───────────────────────────────────────────');
  const payments = await prisma.payment.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: 'asc' },
  });
  for (const p of payments) {
    console.log(`  [${p.status}] ${rupees(p.amountCents)} ${p.purpose} method=${p.method || '-'}`);
    console.log(`     order=${p.razorpayOrderId}  rzpPayment=${p.razorpayPaymentId || '-'}`);
    console.log(`     signature=${p.razorpaySignature ? 'stored' : '-'}  invoiceId=${p.invoiceId || '-'}  capturedAt=${p.capturedAt?.toISOString() || '-'}`);
    if (p.errorDescription) console.log(`     error: ${p.errorCode || ''} ${p.errorDescription}`);
    const gw = JSON.parse(p.gatewayResponse || '{}');
    console.log(`     gatewayResponse: ${Object.keys(gw).length ? `stored (${Object.keys(gw).length} fields, amount=${gw.amount ?? '-'})` : 'empty'}`);
  }
  if (!payments.length) console.log('  (none)');

  console.log('── Subscriptions (TechStart, oldest first) ────────────');
  const subs = await prisma.subscription.findMany({
    where: { customerId: customer.id },
    include: { planVersion: { include: { plan: true } } },
    orderBy: { createdAt: 'asc' },
  });
  for (const s of subs) {
    console.log(`  [${s.status}] ${s.planVersion.plan.name}  period=${s.currentPeriodStart?.toISOString().slice(0, 10) || 'null'} → ${s.currentPeriodEnd?.toISOString().slice(0, 10) || 'null'}${s.cancelReason ? `  reason="${s.cancelReason}"` : ''}`);
  }

  console.log('── Transaction Ledger (all rows, oldest first) ────────');
  const txns = await prisma.transaction.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: 'asc' },
  });
  for (const t of txns) {
    console.log(`  ${t.type.padEnd(24)} ${t.direction.padEnd(7)} ${rupees(t.amountCents).padStart(9)}  ${t.description}`);
  }
  if (!txns.length) console.log('  (none)');

  console.log('── Invoices (TechStart) ───────────────────────────────');
  const invoices = await prisma.invoice.findMany({
    where: { customerId: customer.id },
    orderBy: { createdAt: 'asc' },
  });
  for (const i of invoices) {
    console.log(`  ${i.invoiceNumber} [${i.status}] total=${rupees(i.totalCents)} due=${rupees(i.amountDueCents)} paidAt=${i.paidAt?.toISOString() || 'null'}`);
  }
  if (!invoices.length) console.log('  (none)');

  console.log('── Webhook events ─────────────────────────────────────');
  const events = await prisma.paymentWebhookEvent.findMany({ orderBy: { receivedAt: 'asc' } });
  for (const e of events) {
    console.log(`  [${e.status}] ${e.eventType}  ${e.razorpayEventId}${e.error ? `  error=${e.error}` : ''}`);
  }
  if (!events.length) console.log('  (none — expected locally: Razorpay cannot reach localhost)');

  // Automated invariant checks
  console.log('── Invariant checks ───────────────────────────────────');
  const captured = payments.filter((p) => p.status === 'CAPTURED');
  const activeSub = subs.find((s) => s.status === 'ACTIVE');
  const checks = [
    ['Exactly one ACTIVE subscription', subs.filter((s) => s.status === 'ACTIVE').length === 1],
    ['ACTIVE sub is a paid plan with a period end', Boolean(activeSub?.currentPeriodEnd)],
    ['Captured payment links to the ACTIVE sub', captured.every((p) => p.subscriptionId === activeSub?.id)],
    ['Captured payment has a PAID invoice', captured.every((p) => p.invoiceId && invoices.find((i) => i.id === p.invoiceId)?.status === 'PAID')],
    ['One PAYMENT_CAPTURED CREDIT per captured payment', captured.every((p) => txns.filter((t) => t.paymentId === p.id && t.type === 'PAYMENT_CAPTURED').length === 1)],
    ['No double activation (one SUBSCRIPTION_ACTIVATED per paid sub)', txns.filter((t) => t.type === 'SUBSCRIPTION_ACTIVATED' && t.subscriptionId === activeSub?.id).length === 1],
    ['Old Free sub was ENDED, not deleted', subs.some((s) => s.status === 'ENDED')],
  ];
  let failed = 0;
  for (const [name, pass] of checks) {
    console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${name}`);
    if (!pass) failed++;
  }
  console.log(failed === 0 ? '\nAll invariants hold.' : `\n${failed} invariant(s) FAILED.`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error('Audit crashed:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
