import { Router } from 'express';
import { authenticate, requireAdminOrMember } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess } from '../middleware/tenantContext.js';
import { parsePagination, paginatedResponse } from '../utils/pagination.js';

const router = Router();
router.use(authenticate, tenantContext, validateTenantAccess, requireAdminOrMember);

// GET /api/plans — list plans
router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const pag = parsePagination(req.query);
    const statusFilter = req.query.status;

    const where = {
      tenantId: req.tenantId,
      ...(statusFilter && { status: statusFilter }),
    };

    const [data, totalCount] = await Promise.all([
      prisma.plan.findMany({
        where,
        include: {
          productFamily: { select: { id: true, name: true } },
          versions: {
            where: { isActive: true },
            take: 1,
            include: { _count: { select: { priceComponents: true } } },
          },
          _count: { select: { versions: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: pag.skip,
        take: pag.take,
      }),
      prisma.plan.count({ where }),
    ]);

    res.json(paginatedResponse(data, totalCount, pag));
  } catch (err) { next(err); }
});

// GET /api/plans/:id — plan detail with all versions and components
router.get('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const plan = await prisma.plan.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
      include: {
        productFamily: true,
        versions: {
          orderBy: { version: 'desc' },
          include: {
            priceComponents: {
              include: { billableMetric: { select: { id: true, name: true, code: true } } },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });
    res.json(plan);
  } catch (err) { next(err); }
});

// POST /api/plans — create plan with initial version and price components
router.post('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { name, description, productFamilyId, planType, billingPeriod, trialDays, currency, priceComponents } = req.body;

    if (!name || !productFamilyId) {
      return res.status(400).json({ error: 'name and productFamilyId are required' });
    }

    const plan = await prisma.$transaction(async (tx) => {
      const p = await tx.plan.create({
        data: {
          tenantId: req.tenantId,
          name,
          description: description || '',
          productFamilyId,
          planType: planType || 'STANDARD',
          status: 'DRAFT',
        },
      });

      const version = await tx.planVersion.create({
        data: {
          planId: p.id,
          version: 1,
          billingPeriod: billingPeriod || 'MONTHLY',
          trialDays: trialDays || 0,
          currency: currency || req.tenant.currency,
          isActive: true,
        },
      });

      // Create price components if provided
      if (priceComponents && priceComponents.length > 0) {
        await tx.priceComponent.createMany({
          data: priceComponents.map((pc) => ({
            planVersionId: version.id,
            name: pc.name,
            feeType: pc.feeType,
            pricingModel: JSON.stringify(pc.pricingModel || {}),
            billableMetricId: pc.billableMetricId || null,
          })),
        });
      }

      return tx.plan.findUnique({
        where: { id: p.id },
        include: {
          versions: {
            include: {
              priceComponents: { include: { billableMetric: true } },
            },
          },
        },
      });
    });

    res.status(201).json(plan);
  } catch (err) { next(err); }
});

// PUT /api/plans/:id — update plan metadata
router.put('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { name, description, status } = req.body;

    // Tenant-scoped lookup prevents cross-tenant mutation
    const existing = await prisma.plan.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Plan not found' });

    if (status && !['DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED'].includes(status)) {
      return res.status(400).json({ error: 'Invalid plan status' });
    }

    const plan = await prisma.plan.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(status && { status }),
      },
    });
    res.json(plan);
  } catch (err) { next(err); }
});

// POST /api/plans/:id/publish — activate a plan
router.post('/:id/publish', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const existing = await prisma.plan.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Plan not found' });

    const plan = await prisma.plan.update({
      where: { id: req.params.id },
      data: { status: 'ACTIVE' },
    });
    res.json(plan);
  } catch (err) { next(err); }
});

// POST /api/plans/:id/versions — create a new version (copy price components from latest)
router.post('/:id/versions', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { billingPeriod, trialDays, currency, priceComponents } = req.body;

    // Tenant-scoped lookup prevents cross-tenant version creation
    const plan = await prisma.plan.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const latestVersion = await prisma.planVersion.findFirst({
      where: { planId: req.params.id },
      orderBy: { version: 'desc' },
      include: { priceComponents: true },
    });

    const newVersionNum = latestVersion ? latestVersion.version + 1 : 1;

    const newVersion = await prisma.$transaction(async (tx) => {
      // Deactivate all previous versions
      await tx.planVersion.updateMany({
        where: { planId: req.params.id },
        data: { isActive: false },
      });

      const v = await tx.planVersion.create({
        data: {
          planId: req.params.id,
          version: newVersionNum,
          billingPeriod: billingPeriod || latestVersion?.billingPeriod || 'MONTHLY',
          trialDays: trialDays ?? latestVersion?.trialDays ?? 0,
          currency: currency || latestVersion?.currency || 'INR',
          isActive: true,
        },
      });

      // Use provided components or copy from latest version
      const components = priceComponents || latestVersion?.priceComponents?.map((pc) => ({
        name: pc.name,
        feeType: pc.feeType,
        pricingModel: pc.pricingModel,
        billableMetricId: pc.billableMetricId,
      })) || [];

      if (components.length > 0) {
        await tx.priceComponent.createMany({
          data: components.map((pc) => ({
            planVersionId: v.id,
            name: pc.name,
            feeType: pc.feeType,
            pricingModel: typeof pc.pricingModel === 'string' ? pc.pricingModel : JSON.stringify(pc.pricingModel || {}),
            billableMetricId: pc.billableMetricId || null,
          })),
        });
      }

      return tx.planVersion.findUnique({
        where: { id: v.id },
        include: { priceComponents: { include: { billableMetric: true } } },
      });
    });

    res.status(201).json(newVersion);
  } catch (err) { next(err); }
});

// PUT /api/plans/:planId/versions/:versionId/components — replace all price components
router.put('/:planId/versions/:versionId/components', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { priceComponents } = req.body;
    if (!priceComponents) return res.status(400).json({ error: 'priceComponents array is required' });

    // Tenant-scoped lookup prevents cross-tenant component replacement
    const plan = await prisma.plan.findFirst({ where: { id: req.params.planId, tenantId: req.tenantId } });
    if (!plan) return res.status(404).json({ error: 'Plan not found' });

    const version = await prisma.planVersion.findFirst({ where: { id: req.params.versionId, planId: req.params.planId } });
    if (!version) return res.status(404).json({ error: 'Plan version not found' });

    await prisma.$transaction(async (tx) => {
      // Delete existing components
      await tx.priceComponent.deleteMany({ where: { planVersionId: req.params.versionId } });
      // Create new ones
      await tx.priceComponent.createMany({
        data: priceComponents.map((pc) => ({
          planVersionId: req.params.versionId,
          name: pc.name,
          feeType: pc.feeType,
          pricingModel: JSON.stringify(pc.pricingModel || {}),
          billableMetricId: pc.billableMetricId || null,
        })),
      });
    });

    const updated = await prisma.planVersion.findUnique({
      where: { id: req.params.versionId },
      include: { priceComponents: { include: { billableMetric: true } } },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/plans/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const existing = await prisma.plan.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Plan not found' });

    const activeSubs = await prisma.subscription.count({
      where: {
        planVersion: { planId: req.params.id },
        status: { in: ['ACTIVE', 'TRIAL', 'PENDING'] },
      },
    });
    if (activeSubs > 0) {
      return res.status(409).json({ error: 'Cannot delete plan with active subscriptions' });
    }
    await prisma.plan.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
