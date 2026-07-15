import { Router } from 'express';
import { authenticate, requireAdminOrMember } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess } from '../middleware/tenantContext.js';

const router = Router();
router.use(authenticate, tenantContext, validateTenantAccess, requireAdminOrMember);

// GET /api/product-families
router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const families = await prisma.productFamily.findMany({
      where: { tenantId: req.tenantId },
      include: { _count: { select: { products: true, plans: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: families });
  } catch (err) { next(err); }
});

// POST /api/product-families
router.post('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const family = await prisma.productFamily.create({
      data: { tenantId: req.tenantId, name },
    });
    res.status(201).json(family);
  } catch (err) { next(err); }
});

// DELETE /api/product-families/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const existing = await prisma.productFamily.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Product family not found' });
    await prisma.productFamily.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
