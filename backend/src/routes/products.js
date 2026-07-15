import { Router } from 'express';
import { authenticate, requireAdminOrMember } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess } from '../middleware/tenantContext.js';

const router = Router();
router.use(authenticate, tenantContext, validateTenantAccess, requireAdminOrMember);

// GET /api/products
router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const products = await prisma.product.findMany({
      where: { tenantId: req.tenantId },
      include: { productFamily: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: products });
  } catch (err) { next(err); }
});

// POST /api/products
router.post('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { name, description, productFamilyId } = req.body;
    if (!name || !productFamilyId) return res.status(400).json({ error: 'name and productFamilyId are required' });
    const product = await prisma.product.create({
      data: { tenantId: req.tenantId, name, description: description || '', productFamilyId },
    });
    res.status(201).json(product);
  } catch (err) { next(err); }
});

// PUT /api/products/:id
router.put('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { name, description } = req.body;
    const existing = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Product not found' });
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data: { ...(name && { name }), ...(description !== undefined && { description }) },
    });
    res.json(product);
  } catch (err) { next(err); }
});

// DELETE /api/products/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const existing = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Product not found' });
    await prisma.product.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
