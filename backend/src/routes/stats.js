import { Router } from 'express';
import { authenticate, requireAdminOrMember } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess } from '../middleware/tenantContext.js';
import { getMeteredEstimate } from '../services/billingCycles.js';

const router = Router();
router.use(authenticate, tenantContext, validateTenantAccess, requireAdminOrMember);

// GET /api/stats — dashboard statistics
router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const tenantId = req.tenantId;

    // Parallel queries for dashboard KPIs
    const [
      totalCustomers,
      activeSubscriptions,
      trialSubscriptions,
      totalInvoices,
      paidInvoices,
      overdueInvoices,
      recentInvoices,
      subscriptionsByStatus,
    ] = await Promise.all([
      prisma.customer.count({ where: { tenantId } }),
      prisma.subscription.count({ where: { tenantId, status: 'ACTIVE' } }),
      prisma.subscription.count({ where: { tenantId, status: 'TRIAL' } }),
      prisma.invoice.count({ where: { tenantId } }),
      prisma.invoice.count({ where: { tenantId, status: 'PAID' } }),
      prisma.invoice.count({ where: { tenantId, status: 'OVERDUE' } }),
      prisma.invoice.findMany({
        where: { tenantId, status: 'PAID' },
        select: { totalCents: true, issueDate: true },
        orderBy: { issueDate: 'desc' },
        take: 365,
      }),
      prisma.subscription.groupBy({
        by: ['status'],
        where: { tenantId },
        _count: true,
      }),
    ]);

    // Calculate MRR from active subscriptions' plan version prices
    const activeSubs = await prisma.subscription.findMany({
      where: { tenantId, status: 'ACTIVE' },
      include: {
        planVersion: { include: { priceComponents: true } },
        components: true,
        coupon: true,
      },
    });

    let mrrCents = 0;
    for (const sub of activeSubs) {
      for (const comp of sub.planVersion.priceComponents) {
        const pricing = JSON.parse(comp.pricingModel || '{}');
        // Only flat (fixed recurring) components contribute to base MRR.
        // Usage-based rates (per_unit, per_thousand, tiered) are not fixed revenue.
        if (pricing.model === 'flat') {
          const amount = pricing.price || 0;
          const cents = Math.round(amount * 100);
          // Normalize to monthly
          const period = sub.planVersion.billingPeriod;
          if (period === 'MONTHLY') mrrCents += cents;
          else if (period === 'QUARTERLY') mrrCents += Math.round(cents / 3);
          else if (period === 'ANNUAL') mrrCents += Math.round(cents / 12);
        }
      }
    }

    // Build monthly revenue chart (last 12 months)
    const monthlyRevenue = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);
      const monthInvoices = recentInvoices.filter((inv) => {
        const d = new Date(inv.issueDate);
        return d >= monthStart && d <= monthEnd;
      });
      const revenue = monthInvoices.reduce((sum, inv) => sum + inv.totalCents, 0);
      monthlyRevenue.push({
        month: monthStart.toISOString().slice(0, 7), // YYYY-MM
        revenueCents: revenue,
      });
    }

    // ─── Storage Stats ──────────────────────────────────────
    const [totalBuckets, totalObjects, storageAgg, storageBuckets] = await Promise.all([
      prisma.storageBucket.count({ where: { tenantId } }),
      prisma.storageObject.count({ where: { bucket: { tenantId }, isDeleted: false } }),
      // True total across ALL buckets (the top-5 list below must not define the total).
      prisma.storageBucket.aggregate({ where: { tenantId }, _sum: { usedBytes: true } }),
      prisma.storageBucket.findMany({
        where: { tenantId },
        select: { usedBytes: true, name: true, customerId: true, customer: { select: { name: true } } },
        orderBy: { usedBytes: 'desc' },
        take: 5,
      }),
    ]);

    const totalStorageBytes = Number(storageAgg._sum.usedBytes || 0);

    res.json({
      totalCustomers,
      activeSubscriptions,
      trialSubscriptions,
      totalInvoices,
      paidInvoices,
      overdueInvoices,
      mrrCents,
      monthlyRevenue,
      subscriptionsByStatus: subscriptionsByStatus.map((s) => ({ status: s.status, count: s._count })),
      // Storage stats
      storage: {
        totalBuckets,
        totalObjects,
        totalBytes: totalStorageBytes,
        totalGB: Math.round(totalStorageBytes / (1024 * 1024 * 1024) * 1000) / 1000,
        topBuckets: storageBuckets.map(b => ({
          name: b.name,
          customerName: b.customer.name,
          usedBytes: Number(b.usedBytes),
          usedGB: Math.round(Number(b.usedBytes) / (1024 * 1024 * 1024) * 1000) / 1000,
        })),
      },
    });
  } catch (err) { next(err); }
});

// GET /api/stats/metered — metered-billing operations dashboard:
// customers, estimated revenue, billing cycles, metering health, cap enforcement.
router.get('/metered', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const tenantId = req.tenantId;
    const now = new Date();

    // Active metered subscriptions with plan + customer context
    const meteredSubs = await prisma.subscription.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
        planVersion: { plan: { planType: 'METERED' } },
      },
      include: {
        customer: { select: { id: true, name: true, email: true } },
        planVersion: { include: { plan: true, priceComponents: { include: { billableMetric: true } } } },
      },
    });

    // Overdue metered invoices (drive the upload block) — one query for all
    const customerIds = meteredSubs.map((s) => s.customerId);
    const overdueInvoices = customerIds.length ? await prisma.invoice.findMany({
      where: { tenantId, customerId: { in: customerIds }, status: 'OVERDUE', amountDueCents: { gt: 0 } },
      select: { id: true, customerId: true, invoiceNumber: true, amountDueCents: true, dueDate: true },
    }) : [];
    const overdueByCustomer = new Map(overdueInvoices.map((inv) => [inv.customerId, inv]));

    // Current real-time storage per metered customer (cap enforcement view)
    const bucketAggs = customerIds.length ? await prisma.storageBucket.groupBy({
      by: ['customerId'],
      where: { tenantId, customerId: { in: customerIds } },
      _sum: { usedBytes: true },
    }) : [];
    const bytesByCustomer = new Map(bucketAggs.map((b) => [b.customerId, Number(b._sum.usedBytes || 0)]));

    // Per-customer live estimates
    const customers = [];
    let accruedTotalCents = 0;
    let projectedTotalCents = 0;
    for (const sub of meteredSubs) {
      const estimate = await getMeteredEstimate(prisma, sub).catch(() => null);
      if (estimate) {
        accruedTotalCents += estimate.accruedCents;
        projectedTotalCents += estimate.projectedCents;
      }
      const currentBytes = bytesByCustomer.get(sub.customerId) || 0;
      const currentGB = currentBytes / (1024 ** 3);
      const capGB = estimate?.hardCapGB || 1;
      const overdue = overdueByCustomer.get(sub.customerId) || null;
      customers.push({
        subscriptionId: sub.id,
        customerId: sub.customerId,
        customerName: sub.customer.name,
        customerEmail: sub.customer.email,
        periodStart: sub.currentPeriodStart,
        periodEnd: sub.currentPeriodEnd,
        avgGBSoFar: estimate?.avgGBSoFar ?? 0,
        currentGB: Math.round(currentGB * 10000) / 10000,
        capGB,
        capUsagePercent: Math.min(100, Math.round((currentGB / capGB) * 100)),
        atCap: currentGB >= capGB * 0.98,
        accruedCents: estimate?.accruedCents ?? 0,
        projectedCents: estimate?.projectedCents ?? 0,
        pricePerGBMonth: estimate?.pricePerGBMonth ?? null,
        uploadsBlocked: Boolean(overdue),
        overdueInvoice: overdue,
      });
    }

    // Billed metered revenue (paid + outstanding)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [paidAgg, outstandingAgg] = await Promise.all([
      prisma.invoice.aggregate({
        where: { tenantId, status: 'PAID', paidAt: { gte: monthStart }, billingCycle: { isNot: null } },
        _sum: { totalCents: true },
      }),
      prisma.invoice.aggregate({
        where: { tenantId, status: { in: ['FINALIZED', 'OVERDUE'] }, billingCycle: { isNot: null } },
        _sum: { amountDueCents: true },
      }),
    ]);

    // Recent billing cycles
    const cycles = await prisma.billingCycle.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: {
        subscription: { include: { customer: { select: { name: true } } } },
        invoice: { select: { id: true, invoiceNumber: true, status: true, totalCents: true, amountDueCents: true } },
      },
    });

    // Metering health: snapshot recency + coverage
    const [lastSnapshot, snapshots24h, coveredCustomers] = await Promise.all([
      prisma.storageSnapshot.findFirst({ orderBy: { snapshotTime: 'desc' }, select: { snapshotTime: true } }),
      prisma.storageSnapshot.count({ where: { tenantId, snapshotTime: { gte: new Date(now.getTime() - 86400000) } } }),
      prisma.storageSnapshot.groupBy({
        by: ['customerId'],
        where: { tenantId, bucketId: null, snapshotTime: { gte: new Date(now.getTime() - 86400000) } },
      }),
    ]);
    const lastSnapshotAgeMinutes = lastSnapshot
      ? Math.round((now.getTime() - lastSnapshot.snapshotTime.getTime()) / 60000)
      : null;

    res.json({
      customers,
      revenue: {
        accruedCents: accruedTotalCents,          // open cycles, earned so far
        projectedCents: projectedTotalCents,      // open cycles, projected at cycle end
        paidThisMonthCents: paidAgg._sum.totalCents || 0,
        outstandingCents: outstandingAgg._sum.amountDueCents || 0,
      },
      cycles: cycles.map((c) => ({
        id: c.id,
        customerName: c.subscription.customer.name,
        status: c.status,
        periodStart: c.periodStart,
        periodEnd: c.periodEnd,
        avgGB: c.avgGB,
        gbHours: c.gbHours,
        peakGB: c.peakGB,
        snapshotCount: c.snapshotCount,
        amountCents: c.amountCents,
        closedAt: c.closedAt,
        invoice: c.invoice,
      })),
      health: {
        lastSnapshotAt: lastSnapshot?.snapshotTime || null,
        lastSnapshotAgeMinutes,
        // Snapshots run every 15 min; >30 min old means the metering cron is unhealthy.
        healthy: lastSnapshotAgeMinutes != null && lastSnapshotAgeMinutes <= 30,
        snapshots24h,
        customersCovered24h: coveredCustomers.length,
      },
      meteredCustomerCount: meteredSubs.length,
      blockedCustomerCount: customers.filter((c) => c.uploadsBlocked).length,
    });
  } catch (err) { next(err); }
});

export default router;
