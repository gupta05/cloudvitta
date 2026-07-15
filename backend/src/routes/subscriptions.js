import { Router } from 'express';
import { authenticate, requireAdminOrMember } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess } from '../middleware/tenantContext.js';
import { parsePagination, paginatedResponse } from '../utils/pagination.js';
import { activateSubscription, cancelSubscription, changeSubscriptionPlan } from '../services/subscriptionLifecycle.js';

const router = Router();
router.use(authenticate, tenantContext, validateTenantAccess, requireAdminOrMember);

// GET /api/subscriptions
router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const pag = parsePagination(req.query);
    const { status, customerId } = req.query;

    const where = {
      tenantId: req.tenantId,
      ...(status && { status }),
      ...(customerId && { customerId }),
    };

    const [data, totalCount] = await Promise.all([
      prisma.subscription.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, email: true } },
          planVersion: { include: { plan: { select: { id: true, name: true } } } },
          coupon: { select: { id: true, code: true, discountType: true, discountValue: true } },
          _count: { select: { components: true, addons: true, invoices: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: pag.skip,
        take: pag.take,
      }),
      prisma.subscription.count({ where }),
    ]);

    res.json(paginatedResponse(data, totalCount, pag));
  } catch (err) { next(err); }
});

// GET /api/subscriptions/:id
router.get('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const sub = await prisma.subscription.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
      include: {
        customer: true,
        planVersion: {
          include: {
            plan: true,
            priceComponents: { include: { billableMetric: true } },
          },
        },
        components: { include: { priceComponent: { include: { billableMetric: true } } } },
        addons: { include: { addon: true } },
        coupon: true,
        invoices: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
    if (!sub) return res.status(404).json({ error: 'Subscription not found' });
    res.json(sub);
  } catch (err) { next(err); }
});

// POST /api/subscriptions — create subscription
router.post('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { customerId, planVersionId, billingStartDate, billingDay, couponId, componentOverrides } = req.body;

    if (!customerId || !planVersionId) {
      return res.status(400).json({ error: 'customerId and planVersionId are required' });
    }

    // Verify plan version exists and get its components
    const planVersion = await prisma.planVersion.findUnique({
      where: { id: planVersionId },
      include: { plan: true, priceComponents: true },
    });
    if (!planVersion) return res.status(404).json({ error: 'Plan version not found' });

    const startDate = billingStartDate ? new Date(billingStartDate) : new Date();
    const trialEnd = planVersion.trialDays > 0
      ? new Date(startDate.getTime() + planVersion.trialDays * 86400000)
      : null;

    const sub = await prisma.$transaction(async (tx) => {
      const subscription = await tx.subscription.create({
        data: {
          tenantId: req.tenantId,
          customerId,
          planVersionId,
          status: planVersion.trialDays > 0 ? 'TRIAL' : 'PENDING',
          billingStartDate: startDate,
          billingDay: billingDay || startDate.getDate(),
          trialStartDate: planVersion.trialDays > 0 ? startDate : null,
          trialEndDate: trialEnd,
          couponId: couponId || null,
        },
      });

      // Create subscription components for each price component
      const overrides = componentOverrides || {};
      await tx.subscriptionComponent.createMany({
        data: planVersion.priceComponents.map((pc) => ({
          subscriptionId: subscription.id,
          priceComponentId: pc.id,
          pricingOverride: overrides[pc.id] ? JSON.stringify(overrides[pc.id]) : null,
        })),
      });

      // If coupon, increment redemption count
      if (couponId) {
        await tx.coupon.update({
          where: { id: couponId },
          data: { timesRedeemed: { increment: 1 } },
        });
      }

      return tx.subscription.findUnique({
        where: { id: subscription.id },
        include: {
          customer: true,
          planVersion: { include: { plan: true } },
          components: { include: { priceComponent: true } },
          coupon: true,
        },
      });
    });

    res.status(201).json(sub);
  } catch (err) { next(err); }
});

// POST /api/subscriptions/:id/activate
router.post('/:id/activate', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const existing = await prisma.subscription.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Subscription not found' });
    const result = await activateSubscription(prisma, req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/subscriptions/:id/cancel
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const existing = await prisma.subscription.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Subscription not found' });
    const { reason } = req.body;
    const result = await cancelSubscription(prisma, req.params.id, reason);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/subscriptions/:id/change-plan
router.post('/:id/change-plan', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const existing = await prisma.subscription.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Subscription not found' });
    const { newPlanVersionId } = req.body;
    if (!newPlanVersionId) return res.status(400).json({ error: 'newPlanVersionId is required' });
    const result = await changeSubscriptionPlan(prisma, req.params.id, newPlanVersionId);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/subscriptions/:id/addons — attach addon
router.post('/:id/addons', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const existing = await prisma.subscription.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Subscription not found' });
    const { addonId, quantity } = req.body;
    if (!addonId) return res.status(400).json({ error: 'addonId is required' });
    const subAddon = await prisma.subscriptionAddon.create({
      data: { subscriptionId: req.params.id, addonId, quantity: quantity || 1 },
      include: { addon: true },
    });
    res.status(201).json(subAddon);
  } catch (err) { next(err); }
});

// DELETE /api/subscriptions/:id/addons/:addonId
router.delete('/:id/addons/:subAddonId', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const existing = await prisma.subscription.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Subscription not found' });
    const subAddon = await prisma.subscriptionAddon.findFirst({
      where: { id: req.params.subAddonId, subscriptionId: req.params.id },
    });
    if (!subAddon) return res.status(404).json({ error: 'Subscription addon not found' });
    await prisma.subscriptionAddon.delete({ where: { id: req.params.subAddonId } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
