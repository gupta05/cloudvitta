/**
 * CloudVitta Subscription Lifecycle Service
 * Equivalent to Meteroid's subscription repositories (18KB+ of state machine logic)
 *
 * Handles state transitions:
 * PENDING -> ACTIVE (activate)
 * TRIAL -> ACTIVE (trial ends)
 * ACTIVE -> CANCELLED (cancel)
 * ACTIVE -> PAUSED (pause)
 * ACTIVE -> ACTIVE (plan change)
 * CANCELLED/ENDED -> (terminal)
 */

import { ApiError } from '../utils/errors.js';
import { recordTransaction, TXN } from './ledger.js';
import { computePlanChargeCents, notifyCustomerUsers } from './paymentService.js';

const VALID_TRANSITIONS = {
  PENDING: ['ACTIVE', 'CANCELLED'],
  TRIAL: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['PAUSED', 'CANCELLED', 'ENDED'],
  PAUSED: ['ACTIVE', 'CANCELLED'],
  CANCELLED: [], // terminal
  ENDED: [],     // terminal
};

function validateTransition(currentStatus, newStatus) {
  const allowed = VALID_TRANSITIONS[currentStatus] || [];
  if (!allowed.includes(newStatus)) {
    throw new ApiError(400, `Invalid transition: ${currentStatus} → ${newStatus}`);
  }
}

/**
 * Activate a subscription (PENDING/TRIAL → ACTIVE).
 */
export async function activateSubscription(prisma, subscriptionId) {
  const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) throw new ApiError(404, 'Subscription not found');

  validateTransition(sub.status, 'ACTIVE');

  return prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      status: 'ACTIVE',
      billingStartDate: sub.billingStartDate || new Date(),
    },
    include: {
      customer: true,
      planVersion: { include: { plan: true } },
    },
  });
}

/**
 * Cancel a subscription.
 */
export async function cancelSubscription(prisma, subscriptionId, reason) {
  const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) throw new ApiError(404, 'Subscription not found');

  validateTransition(sub.status, 'CANCELLED');

  return prisma.subscription.update({
    where: { id: subscriptionId },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelReason: reason || null,
    },
    include: {
      customer: true,
      planVersion: { include: { plan: true } },
    },
  });
}

/**
 * Change a subscription to a new plan version (upgrade/downgrade).
 */
export async function changeSubscriptionPlan(prisma, subscriptionId, newPlanVersionId) {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { components: true },
  });
  if (!sub) throw new ApiError(404, 'Subscription not found');
  if (!['ACTIVE', 'TRIAL'].includes(sub.status)) {
    throw new ApiError(400, `Cannot change plan for subscription in ${sub.status} status`);
  }

  const newVersion = await prisma.planVersion.findUnique({
    where: { id: newPlanVersionId },
    include: { priceComponents: true },
  });
  if (!newVersion) throw new ApiError(404, 'New plan version not found');

  return prisma.$transaction(async (tx) => {
    // Remove old components
    await tx.subscriptionComponent.deleteMany({ where: { subscriptionId } });

    // Create new components
    await tx.subscriptionComponent.createMany({
      data: newVersion.priceComponents.map((pc) => ({
        subscriptionId,
        priceComponentId: pc.id,
      })),
    });

    // Update subscription
    return tx.subscription.update({
      where: { id: subscriptionId },
      data: { planVersionId: newPlanVersionId },
      include: {
        customer: true,
        planVersion: { include: { plan: true, priceComponents: true } },
        components: { include: { priceComponent: true } },
      },
    });
  });
}

/**
 * Process trial expirations — called by scheduler.
 * Free-plan trials past their end date become ACTIVE. Paid-plan trials with no
 * payment are downgraded to the Free plan (a paid subscription must never
 * activate without a verified payment).
 */
export async function processTrialExpirations(prisma) {
  const now = new Date();
  const expiredTrials = await prisma.subscription.findMany({
    where: { status: 'TRIAL', trialEndDate: { lte: now } },
    include: { planVersion: { include: { plan: true, priceComponents: true } } },
  });

  let activated = 0;
  let downgraded = 0;
  for (const sub of expiredTrials) {
    if (computePlanChargeCents(sub.planVersion) > 0) {
      await downgradeToFreePlan(prisma, sub, 'Trial ended without payment');
      downgraded++;
    } else {
      await prisma.subscription.update({
        where: { id: sub.id },
        data: { status: 'ACTIVE' },
      });
      activated++;
    }
  }

  return { processedTrials: activated, downgradedTrials: downgraded };
}

/**
 * End a paid subscription and move the customer to the Free plan.
 * Used on paid-period expiry, unpaid trial expiry, and full refunds.
 */
export async function downgradeToFreePlan(prisma, subscription, reason, endLedgerType = TXN.SUBSCRIPTION_EXPIRED) {
  const now = new Date();

  const freePlan = await prisma.plan.findFirst({
    where: { tenantId: subscription.tenantId, planType: 'FREE', status: 'ACTIVE' },
    include: { versions: { where: { isActive: true }, include: { priceComponents: true } } },
  });
  const freeVersion = freePlan?.versions[0];

  const endedSub = await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: 'ENDED', cancelledAt: now, cancelReason: reason },
    include: { planVersion: { include: { plan: true } } },
  });

  await recordTransaction(prisma, {
    tenantId: subscription.tenantId,
    customerId: subscription.customerId,
    type: endLedgerType,
    description: `${endedSub.planVersion.plan.name} plan ended: ${reason}`,
    subscriptionId: subscription.id,
    idempotencyKey: `${subscription.id}:${endLedgerType}`,
  });

  let freeSub = null;
  if (freeVersion) {
    freeSub = await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.create({
        data: {
          tenantId: subscription.tenantId,
          customerId: subscription.customerId,
          planVersionId: freeVersion.id,
          status: 'ACTIVE',
          billingStartDate: now,
          billingDay: now.getDate(),
        },
      });
      if (freeVersion.priceComponents.length > 0) {
        await tx.subscriptionComponent.createMany({
          data: freeVersion.priceComponents.map((pc) => ({ subscriptionId: sub.id, priceComponentId: pc.id })),
        });
      }
      return sub;
    });
    await recordTransaction(prisma, {
      tenantId: subscription.tenantId,
      customerId: subscription.customerId,
      type: TXN.SUBSCRIPTION_ACTIVATED,
      description: `${freePlan.name} plan activated (automatic downgrade: ${reason})`,
      subscriptionId: freeSub.id,
      idempotencyKey: `${freeSub.id}:SUBSCRIPTION_ACTIVATED`,
    });
  } else {
    console.error(`[Subscriptions] No active Free plan found for tenant ${subscription.tenantId} — customer ${subscription.customerId} left without a subscription`);
  }

  notifyCustomerUsers(prisma, subscription.customerId, {
    title: 'Plan changed to Free',
    message: `Your ${endedSub.planVersion.plan.name} plan has ended (${reason.toLowerCase()}). You are now on the Free plan (500 MB). Renew or upgrade anytime from the Billing page.`,
    metadata: { subscriptionId: subscription.id },
  }).catch(() => {});

  console.log(`[Subscriptions] Downgraded customer ${subscription.customerId} to Free (${reason})`);
  return { endedSub, freeSub };
}

/**
 * Process paid-subscription expirations — called hourly by the scheduler.
 * Inside the grace window: send a one-time renewal reminder.
 * Past the grace window: downgrade to the Free plan.
 */
export async function processPaidSubscriptionExpirations(prisma) {
  const now = new Date();
  const graceDays = Number(process.env.RENEWAL_GRACE_DAYS ?? 3);
  const graceCutoff = new Date(now.getTime() - graceDays * 86400000);

  const lapsed = await prisma.subscription.findMany({
    where: { status: 'ACTIVE', currentPeriodEnd: { not: null, lt: now } },
    include: { planVersion: { include: { plan: true } } },
  });

  let downgradedCount = 0;
  let remindedCount = 0;

  for (const sub of lapsed) {
    if (sub.currentPeriodEnd < graceCutoff) {
      await downgradeToFreePlan(prisma, sub, 'Paid period expired without renewal');
      downgradedCount++;
    } else {
      // Grace window — remind once per subscription.
      const users = await prisma.user.findMany({ where: { customerId: sub.customerId, role: 'user' } });
      for (const user of users) {
        const alreadyReminded = await prisma.notification.findFirst({
          where: { userId: user.id, title: 'Renewal reminder', metadata: { contains: sub.id } },
        });
        if (!alreadyReminded) {
          await prisma.notification.create({
            data: {
              userId: user.id,
              type: 'billing',
              title: 'Renewal reminder',
              message: `Your ${sub.planVersion.plan.name} plan expired on ${sub.currentPeriodEnd.toDateString()}. Renew within ${graceDays} days to keep your plan, or you will be moved to the Free plan.`,
              metadata: JSON.stringify({ subscriptionId: sub.id }),
            },
          });
          remindedCount++;
        }
      }
    }
  }

  return { downgraded: downgradedCount, reminded: remindedCount };
}
