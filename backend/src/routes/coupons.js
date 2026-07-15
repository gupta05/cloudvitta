import { Router } from 'express';
import { authenticate, requireAdminOrMember } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess } from '../middleware/tenantContext.js';

const router = Router();
router.use(authenticate, tenantContext, validateTenantAccess, requireAdminOrMember);

// GET /api/coupons
router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const coupons = await prisma.coupon.findMany({
      where: { tenantId: req.tenantId },
      include: { _count: { select: { subscriptions: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: coupons });
  } catch (err) { next(err); }
});

// POST /api/coupons
router.post('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { code, description, discountType, discountValue, currency, maxRedemptions, expiresAt } = req.body;
    if (!code || !discountType || discountValue === undefined) {
      return res.status(400).json({ error: 'code, discountType, and discountValue are required' });
    }
    if (!['PERCENTAGE', 'FIXED_AMOUNT'].includes(discountType)) {
      return res.status(400).json({ error: 'discountType must be PERCENTAGE or FIXED_AMOUNT' });
    }
    if (discountType === 'PERCENTAGE' && (discountValue < 0 || discountValue > 100)) {
      return res.status(400).json({ error: 'Percentage discount must be between 0 and 100' });
    }
    if (discountValue < 0) {
      return res.status(400).json({ error: 'discountValue must be non-negative' });
    }
    const coupon = await prisma.coupon.create({
      data: {
        tenantId: req.tenantId, code: code.toUpperCase(), description: description || '',
        discountType, discountValue, currency: currency || null,
        maxRedemptions: maxRedemptions || null, expiresAt: expiresAt ? new Date(expiresAt) : null,
      },
    });
    res.status(201).json(coupon);
  } catch (err) { next(err); }
});

// PUT /api/coupons/:id
router.put('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { isActive, description, maxRedemptions, expiresAt } = req.body;
    const existing = await prisma.coupon.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Coupon not found' });
    const coupon = await prisma.coupon.update({
      where: { id: req.params.id },
      data: {
        ...(isActive !== undefined && { isActive }),
        ...(description !== undefined && { description }),
        ...(maxRedemptions !== undefined && { maxRedemptions }),
        ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
      },
    });
    res.json(coupon);
  } catch (err) { next(err); }
});

// DELETE /api/coupons/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const existing = await prisma.coupon.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Coupon not found' });
    await prisma.coupon.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
