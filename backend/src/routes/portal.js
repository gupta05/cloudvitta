/**
 * CloudVitta Customer Portal API Routes
 * 
 * All endpoints are scoped to the authenticated customer.
 * Admins cannot access these routes.
 */

import { Router } from 'express';
import { authenticate, requireUser } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess } from '../middleware/tenantContext.js';
import { getStorageUsageSummary } from '../services/storageMeter.js';
import { getMeteredEstimate } from '../services/billingCycles.js';
import crypto from 'crypto';

const router = Router();
router.use(authenticate, tenantContext, validateTenantAccess, requireUser);

// ─── Dashboard ──────────────────────────────────────────────

// GET /api/portal/dashboard — customer dashboard summary
router.get('/dashboard', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { tenantId, customerId } = req;

    // Parallel queries for customer KPIs
    const [
      subscription,
      buckets,
      totalObjects,
      recentEvents,
      invoices,
    ] = await Promise.all([
      // Active subscription with plan details
      prisma.subscription.findFirst({
        where: { tenantId, customerId, status: { in: ['ACTIVE', 'TRIAL'] } },
        include: {
          planVersion: {
            include: {
              plan: { select: { name: true, planType: true } },
              priceComponents: true,
            },
          },
          coupon: { select: { code: true, discountType: true, discountValue: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // Storage buckets
      prisma.storageBucket.findMany({
        where: { tenantId, customerId },
        select: { id: true, name: true, usedBytes: true, objectCount: true, createdAt: true },
        orderBy: { usedBytes: 'desc' },
      }),
      // Total objects
      prisma.storageObject.count({
        where: { bucket: { tenantId, customerId }, isDeleted: false },
      }),
      // Recent events (last 24h)
      prisma.usageEvent.count({
        where: {
          tenantId, customerId,
          eventCode: { in: ['storage_put_ops', 'storage_get_ops', 'storage_delete_ops'] },
          timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
        },
      }),
      // Recent invoices
      prisma.invoice.findMany({
        where: { tenantId, customerId },
        select: { id: true, invoiceNumber: true, status: true, totalCents: true, periodStart: true, periodEnd: true, dueDate: true, paidAt: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    // Calculate total storage
    const totalBytes = buckets.reduce((sum, b) => sum + Number(b.usedBytes), 0);
    const totalGB = Math.round(totalBytes / (1024 * 1024 * 1024) * 1000) / 1000;

    // Extract plan quota info
    let quotaGB = 0;
    let monthlyPriceCents = 0;
    if (subscription) {
      for (const comp of subscription.planVersion.priceComponents) {
        const pricing = JSON.parse(comp.pricingModel || '{}');
        // Storage quota = the storage a plan grants (includedGB), falling back to hardCapGB.
        if (pricing.includedGB) quotaGB = pricing.includedGB;
        else if (pricing.hardCapGB && !quotaGB) quotaGB = pricing.hardCapGB;
        if (pricing.model === 'flat') monthlyPriceCents = Math.round((pricing.price || 0) * 100);
      }
    }

    // Estimated cost: prepaid plans = the flat base fee; metered plans = the
    // charge accrued so far this cycle (time-weighted average usage × rate).
    let estimatedCostCents = monthlyPriceCents;
    const isMetered = subscription?.planVersion.plan.planType === 'METERED';
    if (isMetered) {
      const estimate = await getMeteredEstimate(prisma, subscription).catch(() => null);
      if (estimate) estimatedCostCents = estimate.accruedCents;
    }

    res.json({
      storage: {
        totalBytes,
        totalGB,
        totalBuckets: buckets.length,
        totalObjects,
        quotaGB,
        usagePercent: quotaGB > 0 ? Math.round((totalGB / quotaGB) * 100) : 0,
        buckets: buckets.map(b => ({
          ...b,
          usedBytes: Number(b.usedBytes),
          usedGB: Math.round(Number(b.usedBytes) / (1024 * 1024 * 1024) * 1000) / 1000,
        })),
      },
      subscription: subscription ? {
        id: subscription.id,
        status: subscription.status,
        planName: subscription.planVersion.plan.name,
        planType: subscription.planVersion.plan.planType,
        isMetered,
        billingPeriod: subscription.planVersion.billingPeriod,
        trialEndDate: subscription.trialEndDate,
        billingStartDate: subscription.billingStartDate,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        coupon: subscription.coupon,
      } : null,
      requests24h: recentEvents,
      estimatedCostCents,
      recentInvoices: invoices,
    });
  } catch (err) { next(err); }
});

// ─── Subscription ───────────────────────────────────────────

// GET /api/portal/subscription — current subscription details
router.get('/subscription', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { tenantId, customerId } = req;

    const subscription = await prisma.subscription.findFirst({
      where: { tenantId, customerId, status: { in: ['ACTIVE', 'TRIAL', 'PENDING'] } },
      include: {
        planVersion: {
          include: {
            plan: { select: { id: true, name: true, planType: true, description: true } },
            priceComponents: {
              include: { billableMetric: { select: { name: true, code: true } } },
            },
          },
        },
        components: true,
        addons: { include: { addon: true } },
        coupon: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!subscription) {
      return res.json({ subscription: null });
    }

    res.json({ subscription });
  } catch (err) { next(err); }
});

// ─── Invoices ───────────────────────────────────────────────

// GET /api/portal/invoices — customer's invoice history
router.get('/invoices', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { tenantId, customerId } = req;

    const invoices = await prisma.invoice.findMany({
      where: { tenantId, customerId },
      include: {
        subscription: {
          include: { planVersion: { include: { plan: { select: { name: true } } } } },
        },
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ data: invoices });
  } catch (err) { next(err); }
});

// GET /api/portal/invoices/:id — single invoice detail
router.get('/invoices/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { tenantId, customerId } = req;

    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, tenantId, customerId },
      include: {
        customer: true,
        subscription: { include: { planVersion: { include: { plan: true } } } },
        lines: { orderBy: { createdAt: 'asc' } },
        creditNotes: true,
      },
    });

    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.json(invoice);
  } catch (err) { next(err); }
});

// ─── Usage ──────────────────────────────────────────────────

// GET /api/portal/usage — usage breakdown for current period
router.get('/usage', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { tenantId, customerId } = req;
    const { periodStart, periodEnd } = req.query;
    const start = periodStart ? new Date(periodStart) : new Date(Date.now() - 30 * 86400000);
    const end = periodEnd ? new Date(periodEnd) : new Date();

    const usage = await getStorageUsageSummary(prisma, tenantId, customerId, start, end);
    res.json(usage);
  } catch (err) { next(err); }
});

// ─── Activity Feed ──────────────────────────────────────────

// GET /api/portal/activity — recent usage events
router.get('/activity', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { tenantId, customerId } = req;

    const events = await prisma.usageEvent.findMany({
      // Bandwidth (egress/ingress) is an internal metric — never shown to customers.
      where: {
        tenantId,
        customerId,
        eventCode: { notIn: ['storage_egress_bytes', 'storage_ingress_bytes'] },
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    res.json({
      data: events.map(e => ({
        id: e.id,
        eventCode: e.eventCode,
        timestamp: e.timestamp,
        properties: JSON.parse(e.properties || '{}'),
      })),
    });
  } catch (err) { next(err); }
});

// ─── API Keys ───────────────────────────────────────────────

// GET /api/portal/api-keys — list customer's API keys
router.get('/api-keys', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const tokens = await prisma.apiToken.findMany({
      where: { tenantId: req.tenantId },
      select: { id: true, name: true, prefix: true, isActive: true, expiresAt: true, lastUsedAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: tokens });
  } catch (err) { next(err); }
});

// POST /api/portal/api-keys — create API key
router.post('/api-keys', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { name, expiresAt } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const rawToken = `cv_${crypto.randomBytes(32).toString('hex')}`;
    const prefix = rawToken.substring(0, 10);
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const token = await prisma.apiToken.create({
      data: {
        tenantId: req.tenantId, name, tokenHash, prefix,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });

    res.status(201).json({ ...token, rawToken });
  } catch (err) { next(err); }
});

// DELETE /api/portal/api-keys/:id — revoke API key
router.delete('/api-keys/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    // Tenant-scoped lookup prevents cross-tenant key revocation
    const existing = await prisma.apiToken.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'API key not found' });
    await prisma.apiToken.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
