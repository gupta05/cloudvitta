/**
 * CloudVitta Billing Cycle Service — arrears billing for METERED plans.
 *
 * A BillingCycle row tracks each metered subscription's billing period:
 *   OPEN       → the period is running; usage accrues via StorageSnapshots.
 *   INVOICING  → claimed by the cycle-close job (crash-recoverable claim).
 *   INVOICED   → usage facts frozen, FINALIZED invoice issued, next cycle opened.
 *
 * Exactly-once invoicing is guaranteed by three layers:
 *   1. Unique (subscriptionId, periodStart) — a cycle can never be duplicated.
 *   2. CAS claim on BillingCycle.status (updateMany OPEN/INVOICING → INVOICING).
 *   3. Invoice lookup by (subscriptionId, periodStart) before generation —
 *      a crash after invoice creation but before cycle update reuses the invoice.
 *
 * The close job is scan-based (`periodEnd < now`), so missed cron runs (server
 * restarts, downtime) are caught up automatically on the next tick.
 */

import { generateInvoiceForSubscription } from './billing.js';
import { aggregateStorageUsage } from './metering.js';
import { addBillingPeriod, notifyCustomerUsers } from './paymentService.js';
import { recordTransaction, TXN } from './ledger.js';

/** How long an INVOICING claim can sit before it is considered stale (crash recovery). */
const STALE_CLAIM_MS = 60 * 60 * 1000; // 1 hour

/** Payment terms for metered invoices (arrears billing needs tighter dunning than net-30). */
export const METERED_NET_TERMS_DAYS = 7;

/**
 * Open a billing cycle for a metered subscription's current period.
 * Idempotent: the unique (subscriptionId, periodStart) constraint dedupes.
 */
export async function openBillingCycle(prisma, subscription) {
  if (!subscription.currentPeriodStart || !subscription.currentPeriodEnd) {
    throw new Error(`Cannot open billing cycle for subscription ${subscription.id}: missing period bounds`);
  }
  try {
    return await prisma.billingCycle.create({
      data: {
        tenantId: subscription.tenantId,
        customerId: subscription.customerId,
        subscriptionId: subscription.id,
        periodStart: subscription.currentPeriodStart,
        periodEnd: subscription.currentPeriodEnd,
        status: 'OPEN',
      },
    });
  } catch (err) {
    if (err.code === 'P2002') {
      // Already open for this period — fine (retry/race).
      return prisma.billingCycle.findUnique({
        where: { subscriptionId_periodStart: { subscriptionId: subscription.id, periodStart: subscription.currentPeriodStart } },
      });
    }
    throw err;
  }
}

/**
 * Measure a cycle's storage usage (time-weighted average, uncapped + capped).
 */
async function measureCycleUsage(prisma, cycle, pricing, periodEndOverride = null) {
  const periodEnd = periodEndOverride || cycle.periodEnd;
  const usage = await aggregateStorageUsage(
    prisma, cycle.tenantId, cycle.customerId, 'storage_bytes_stored', cycle.periodStart, periodEnd
  );
  const measuredGB = usage.preciseAvgGB ?? usage.rawValue ?? 0;
  const billedGB = Math.min(measuredGB, pricing.hardCapGB || Infinity);
  return {
    avgGB: measuredGB,
    billedGB,
    gbHours: usage.gbHours ?? 0,
    peakGB: usage.peakValue ?? 0,
    snapshotCount: usage.snapshotCount ?? 0,
  };
}

/**
 * Extract the metered storage pricing from a subscription's plan version.
 * Returns null when the subscription has no metered_gb_month component.
 */
export function getMeteredPricing(planVersion) {
  for (const pc of planVersion?.priceComponents || []) {
    const pricing = JSON.parse(pc.pricingModel || '{}');
    if (pricing.model === 'metered_gb_month') return pricing;
  }
  return null;
}

/**
 * Close a single claimed cycle: generate + finalize the invoice, freeze usage
 * facts, and (unless `final`) advance the subscription into the next cycle.
 * The cycle must already be claimed (status INVOICING) by the caller.
 */
async function invoiceClaimedCycle(prisma, cycle, subscription, { final = false, periodEndOverride = null } = {}) {
  const now = new Date();
  const effectiveEnd = periodEndOverride || cycle.periodEnd;
  const pricing = getMeteredPricing(subscription.planVersion) || {};

  // Exactly-once: reuse an invoice if a previous attempt crashed after creating it.
  let invoice = await prisma.invoice.findFirst({
    where: { subscriptionId: subscription.id, periodStart: cycle.periodStart },
  });
  if (!invoice) {
    invoice = await generateInvoiceForSubscription(
      prisma, subscription.id, cycle.tenantId, cycle.periodStart, effectiveEnd
    );
  }

  // Finalize with metered payment terms. Zero-amount invoices are immediately
  // PAID so they never dun (nothing to collect).
  const dueDate = new Date(now.getTime() + METERED_NET_TERMS_DAYS * 86400000);
  if (invoice.status === 'DRAFT') {
    const isZero = invoice.totalCents === 0;
    invoice = await prisma.invoice.update({
      where: { id: invoice.id },
      data: isZero
        ? { status: 'PAID', paidAt: now, amountDueCents: 0, issueDate: now, dueDate }
        : { status: 'FINALIZED', issueDate: now, dueDate },
    });
  }

  const usage = await measureCycleUsage(prisma, cycle, pricing, periodEndOverride);

  await prisma.billingCycle.update({
    where: { id: cycle.id },
    data: {
      status: 'INVOICED',
      invoiceId: invoice.id,
      periodEnd: effectiveEnd,
      avgGB: Math.round(usage.avgGB * 10000) / 10000,
      gbHours: usage.gbHours,
      peakGB: usage.peakGB,
      snapshotCount: usage.snapshotCount,
      amountCents: invoice.totalCents,
      closedAt: now,
    },
  });

  // Advance the subscription's live period pointer and open the next cycle.
  if (!final) {
    const nextStart = cycle.periodEnd;
    const nextEnd = addBillingPeriod(nextStart, subscription.planVersion.billingPeriod);
    const updatedSub = await prisma.subscription.update({
      where: { id: subscription.id },
      data: { currentPeriodStart: nextStart, currentPeriodEnd: nextEnd },
    });
    await openBillingCycle(prisma, updatedSub);
  }

  if (invoice.totalCents > 0) {
    notifyCustomerUsers(prisma, cycle.customerId, {
      title: 'Usage invoice ready',
      message: `Your usage invoice ${invoice.invoiceNumber} for ${cycle.periodStart.toDateString()} – ${effectiveEnd.toDateString()} is ready — ₹${(invoice.totalCents / 100).toFixed(2)} (${usage.billedGB.toFixed(3)} GB average storage). Pay it from the Billing page within ${METERED_NET_TERMS_DAYS} days.`,
      metadata: { invoiceId: invoice.id, billingCycleId: cycle.id },
    }).catch(() => {});
  }

  console.log(`[BillingCycles] Cycle ${cycle.id} invoiced: ${invoice.invoiceNumber} ₹${(invoice.totalCents / 100).toFixed(2)} (avg ${usage.avgGB.toFixed(4)} GB, ${usage.snapshotCount} snapshots)${final ? ' [final]' : ''}`);
  return { invoice, usage };
}

/**
 * Cycle-close job (scheduler entry point). Finds metered cycles whose period
 * has ended — including stale INVOICING claims from crashed runs — claims each
 * with a CAS, and invoices it. Scan-based, so missed runs catch up automatically.
 */
export async function closeDueCycles(prisma) {
  const now = new Date();
  const staleCutoff = new Date(now.getTime() - STALE_CLAIM_MS);

  const dueCycles = await prisma.billingCycle.findMany({
    where: {
      periodEnd: { lt: now },
      OR: [
        { status: 'OPEN' },
        { status: 'INVOICING', updatedAt: { lt: staleCutoff } }, // crash recovery
      ],
    },
    include: {
      subscription: {
        include: { planVersion: { include: { plan: true, priceComponents: { include: { billableMetric: true } } } } },
      },
    },
  });

  let closed = 0;
  let skipped = 0;

  for (const cycle of dueCycles) {
    const sub = cycle.subscription;
    // Only ACTIVE metered subscriptions are cycle-billed here; cancelled/ended
    // subs get their final invoice via finalizeMeteredCycleNow at exit time.
    if (sub.status !== 'ACTIVE' || sub.planVersion.plan.planType !== 'METERED') {
      skipped++;
      continue;
    }

    // CAS claim — exactly one runner wins.
    const claimed = await prisma.billingCycle.updateMany({
      where: { id: cycle.id, status: { in: ['OPEN', 'INVOICING'] }, invoiceId: null },
      data: { status: 'INVOICING' },
    });
    if (claimed.count === 0) { skipped++; continue; }

    try {
      await invoiceClaimedCycle(prisma, cycle, sub);
      closed++;
    } catch (err) {
      console.error(`[BillingCycles] Failed to close cycle ${cycle.id}:`, err.message);
      // Leave it in INVOICING — the stale-claim scan retries it after 1 h.
    }
  }

  return { closed, skipped, scanned: dueCycles.length };
}

/**
 * Immediately finalize the open cycle of a metered subscription that is about
 * to leave ACTIVE status (cancel, plan switch, paid upgrade). Bills usage from
 * periodStart to now; does NOT open a next cycle.
 * MUST be called while the subscription is still ACTIVE (the invoice engine
 * rejects non-ACTIVE subs).
 */
export async function finalizeMeteredCycleNow(prisma, subscription, reason) {
  const now = new Date();

  // Load the plan context if the caller didn't include it.
  let sub = subscription;
  if (!sub.planVersion?.plan || !sub.planVersion?.priceComponents) {
    sub = await prisma.subscription.findUnique({
      where: { id: subscription.id },
      include: { planVersion: { include: { plan: true, priceComponents: { include: { billableMetric: true } } } } },
    });
  }
  if (!sub || sub.planVersion.plan.planType !== 'METERED') return null;

  const cycle = await prisma.billingCycle.findFirst({
    where: { subscriptionId: sub.id, status: { in: ['OPEN', 'INVOICING'] } },
    orderBy: { periodStart: 'desc' },
  });
  if (!cycle) return null;

  const claimed = await prisma.billingCycle.updateMany({
    where: { id: cycle.id, status: { in: ['OPEN', 'INVOICING'] }, invoiceId: null },
    data: { status: 'INVOICING' },
  });
  if (claimed.count === 0) return null;

  try {
    const result = await invoiceClaimedCycle(prisma, cycle, sub, { final: true, periodEndOverride: now });
    recordTransaction(prisma, {
      tenantId: sub.tenantId,
      customerId: sub.customerId,
      type: TXN.INVOICE_GENERATED,
      description: `Final usage invoice for metered plan (${reason})`,
      invoiceId: result.invoice.id,
      subscriptionId: sub.id,
      idempotencyKey: `${cycle.id}:FINAL_CYCLE`,
    }).catch(() => {});
    return result;
  } catch (err) {
    console.error(`[BillingCycles] Final cycle close failed for sub ${sub.id}:`, err.message);
    return null;
  }
}

/**
 * Live estimate for a metered subscription's current cycle.
 *
 * accrued  = what the customer owes for usage measured so far:
 *            (gbHoursSoFar / totalPeriodHours) × pricePerGBMonth
 * projected = accrued + current storage held constant until period end:
 *            ((gbHoursSoFar + currentGB × remainingHours) / totalPeriodHours) × price
 *
 * Both are exactly consistent with the invoice formula (average over the FULL
 * period), and both are capped at hardCapGB.
 */
export async function getMeteredEstimate(prisma, subscription) {
  const now = new Date();
  const pricing = getMeteredPricing(subscription.planVersion);
  if (!pricing) return null;

  const periodStart = subscription.currentPeriodStart;
  const periodEnd = subscription.currentPeriodEnd;
  if (!periodStart || !periodEnd) return null;

  const measureEnd = now < periodEnd ? now : periodEnd;
  const usage = await aggregateStorageUsage(
    prisma, subscription.tenantId, subscription.customerId, 'storage_bytes_stored', periodStart, measureEnd
  );

  const totalPeriodHours = (periodEnd.getTime() - periodStart.getTime()) / 3600000;
  const remainingHours = Math.max(0, (periodEnd.getTime() - now.getTime()) / 3600000);
  const gbHoursSoFar = usage.gbHours ?? 0;

  // Current real-time storage (for projection)
  const buckets = await prisma.storageBucket.findMany({
    where: { tenantId: subscription.tenantId, customerId: subscription.customerId },
    select: { usedBytes: true },
  });
  const currentBytes = buckets.reduce((sum, b) => sum + Number(b.usedBytes), 0);
  const currentGB = currentBytes / (1024 * 1024 * 1024);

  const cap = pricing.hardCapGB || Infinity;
  const price = pricing.pricePerGBMonth || 0;

  const accruedGB = Math.min(totalPeriodHours > 0 ? gbHoursSoFar / totalPeriodHours : 0, cap);
  const projectedGB = Math.min(
    totalPeriodHours > 0 ? (gbHoursSoFar + currentGB * remainingHours) / totalPeriodHours : 0,
    cap
  );

  const cycle = await prisma.billingCycle.findFirst({
    where: { subscriptionId: subscription.id, status: { in: ['OPEN', 'INVOICING'] } },
    orderBy: { periodStart: 'desc' },
  });

  return {
    cycleId: cycle?.id || null,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    elapsedPct: Math.min(100, Math.round(((now.getTime() - periodStart.getTime()) / (periodEnd.getTime() - periodStart.getTime())) * 100)),
    avgGBSoFar: Math.round((usage.preciseAvgGB ?? usage.rawValue ?? 0) * 10000) / 10000,
    gbHours: gbHoursSoFar,
    currentGB: Math.round(currentGB * 10000) / 10000,
    peakGB: usage.peakValue ?? 0,
    snapshotCount: usage.snapshotCount ?? 0,
    accruedCents: Math.round(accruedGB * price * 100),
    projectedCents: Math.round(projectedGB * price * 100),
    pricePerGBMonth: price,
    hardCapGB: pricing.hardCapGB ?? null,
  };
}
