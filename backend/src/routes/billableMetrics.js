import { Router } from 'express';
import { authenticate, requireAdminOrMember } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess } from '../middleware/tenantContext.js';

const router = Router();
router.use(authenticate, tenantContext, validateTenantAccess, requireAdminOrMember);

// GET /api/billable-metrics
router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const metrics = await prisma.billableMetric.findMany({
      where: { tenantId: req.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: metrics });
  } catch (err) { next(err); }
});

// POST /api/billable-metrics
router.post('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { name, code, aggregationType, aggregationKey, description } = req.body;
    if (!name || !code || !aggregationType) {
      return res.status(400).json({ error: 'name, code, and aggregationType are required' });
    }
    const validTypes = ['COUNT', 'SUM', 'MAX', 'UNIQUE_COUNT', 'AVERAGE'];
    if (!validTypes.includes(aggregationType)) {
      return res.status(400).json({ error: `aggregationType must be one of: ${validTypes.join(', ')}` });
    }
    const metric = await prisma.billableMetric.create({
      data: {
        tenantId: req.tenantId,
        name,
        code,
        aggregationType,
        aggregationKey: aggregationKey || '',
        description: description || '',
      },
    });
    res.status(201).json(metric);
  } catch (err) { next(err); }
});

// PUT /api/billable-metrics/:id
router.put('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { name, description } = req.body;
    const existing = await prisma.billableMetric.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Billable metric not found' });
    const metric = await prisma.billableMetric.update({
      where: { id: req.params.id },
      data: { ...(name && { name }), ...(description !== undefined && { description }) },
    });
    res.json(metric);
  } catch (err) { next(err); }
});

// DELETE /api/billable-metrics/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const existing = await prisma.billableMetric.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Billable metric not found' });
    // Check if metric is used in any price component
    const usedCount = await prisma.priceComponent.count({ where: { billableMetricId: req.params.id } });
    if (usedCount > 0) {
      return res.status(409).json({ error: 'Cannot delete metric that is used in price components' });
    }
    await prisma.billableMetric.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
