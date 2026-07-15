import { Router } from 'express';
import { authenticate, requireAdminOrMember } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess } from '../middleware/tenantContext.js';

const router = Router();
router.use(authenticate, tenantContext, validateTenantAccess, requireAdminOrMember);

// GET /api/addons
router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const addons = await prisma.addon.findMany({
      where: { tenantId: req.tenantId },
      include: { _count: { select: { subscriptionAddons: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: addons });
  } catch (err) { next(err); }
});

// POST /api/addons
router.post('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { name, description, feeType, priceCents, currency } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const addon = await prisma.addon.create({
      data: {
        tenantId: req.tenantId, name, description: description || '',
        feeType: feeType || 'ONETIME', priceCents: priceCents || 0, currency: currency || req.tenant.currency,
      },
    });
    res.status(201).json(addon);
  } catch (err) { next(err); }
});

// PUT /api/addons/:id
router.put('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { name, description, priceCents } = req.body;
    const existing = await prisma.addon.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Addon not found' });
    const addon = await prisma.addon.update({
      where: { id: req.params.id },
      data: { ...(name && { name }), ...(description !== undefined && { description }), ...(priceCents !== undefined && { priceCents }) },
    });
    res.json(addon);
  } catch (err) { next(err); }
});

// DELETE /api/addons/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const existing = await prisma.addon.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Addon not found' });
    await prisma.addon.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
