/**
 * CloudVitta Scheduler Service
 * Equivalent to Meteroid's workers/ and scheduled_events
 *
 * Runs periodic background jobs:
 * - Invoice generation for active subscriptions at billing boundaries
 * - Trial expiration processing
 * - Overdue invoice detection
 * - Storage usage snapshots for GB-hour billing
 */

import cron from 'node-cron';
import { generateInvoiceForSubscription } from './billing.js';
import { processTrialExpirations, processPaidSubscriptionExpirations } from './subscriptionLifecycle.js';
import { snapshotStorageUsage } from './storageMeter.js';
import { cleanupExpiredRegistrations } from './otpService.js';

/**
 * Start the scheduler with cron jobs.
 */
export function startScheduler(prisma) {
  console.log('⏰ Starting CloudVitta scheduler...');

  // Run every 15 minutes: snapshot storage usage for GB-hour billing
  cron.schedule('*/15 * * * *', async () => {
    try {
      const result = await snapshotStorageUsage(prisma);
      if (result.snapshotCount > 0) {
        console.log(`[Scheduler] Storage snapshot: ${result.snapshotCount} snapshots for ${result.customerCount} customers`);
      }
    } catch (err) {
      console.error('[Scheduler] Storage snapshot error:', err.message);
    }
  });

  // Run every hour: process trial expirations
  cron.schedule('0 * * * *', async () => {
    try {
      const result = await processTrialExpirations(prisma);
      if (result.processedTrials > 0 || result.downgradedTrials > 0) {
        console.log(`[Scheduler] Trials: ${result.processedTrials} activated, ${result.downgradedTrials} downgraded (unpaid)`);
      }
    } catch (err) {
      console.error('[Scheduler] Trial expiration error:', err.message);
    }
  });

  // Run every hour (:30): process paid-subscription expirations (grace reminders + downgrades)
  cron.schedule('30 * * * *', async () => {
    try {
      const result = await processPaidSubscriptionExpirations(prisma);
      if (result.downgraded > 0 || result.reminded > 0) {
        console.log(`[Scheduler] Paid-sub expirations: ${result.downgraded} downgraded to Free, ${result.reminded} renewal reminders sent`);
      }
    } catch (err) {
      console.error('[Scheduler] Paid-sub expiration error:', err.message);
    }
  });

  // Run daily at 2 AM: detect overdue invoices
  cron.schedule('0 2 * * *', async () => {
    try {
      const now = new Date();
      const result = await prisma.invoice.updateMany({
        where: {
          status: 'FINALIZED',
          dueDate: { lt: now },
        },
        data: { status: 'OVERDUE' },
      });
      if (result.count > 0) {
        console.log(`[Scheduler] Marked ${result.count} invoices as overdue`);
      }
    } catch (err) {
      console.error('[Scheduler] Overdue detection error:', err.message);
    }
  });

  // Run daily at 3 AM: auto-generate invoices for subscriptions reaching billing date
  cron.schedule('0 3 * * *', async () => {
    try {
      const now = new Date();
      const today = now.getDate();

      // Find active subscriptions whose billing day is today
      const dueSubscriptions = await prisma.subscription.findMany({
        where: {
          status: 'ACTIVE',
          billingDay: today,
        },
        include: { planVersion: true },
      });

      let generated = 0;
      for (const sub of dueSubscriptions) {
        try {
          // Check if invoice already exists for this period
          const periodStart = new Date(now.getFullYear(), now.getMonth(), sub.billingDay);
          const existing = await prisma.invoice.findFirst({
            where: {
              subscriptionId: sub.id,
              periodStart: { gte: periodStart },
            },
          });
          if (!existing) {
            await generateInvoiceForSubscription(prisma, sub.id, sub.tenantId);
            generated++;
          }
        } catch (err) {
          console.error(`[Scheduler] Invoice generation failed for sub ${sub.id}:`, err.message);
        }
      }
      if (generated > 0) {
        console.log(`[Scheduler] Generated ${generated} invoices`);
      }
    } catch (err) {
      console.error('[Scheduler] Auto-invoice error:', err.message);
    }
  });

  // Run daily at 4 AM: clean up expired pending registrations (older than 24 hours)
  cron.schedule('0 4 * * *', async () => {
    try {
      const count = await cleanupExpiredRegistrations(prisma);
      if (count > 0) {
        console.log(`[Scheduler] Cleaned up ${count} expired pending registrations`);
      }
    } catch (err) {
      console.error('[Scheduler] Pending registration cleanup error:', err.message);
    }
  });

  console.log('⏰ Scheduler started: storage snapshots (every 15min), trial expiration (hourly), paid-sub expiry (hourly :30), overdue (daily 2AM), invoicing (daily 3AM), registration cleanup (daily 4AM)');
}
