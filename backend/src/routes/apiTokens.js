import { Router } from 'express';
import { authenticate, requireAdminOrMember } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess } from '../middleware/tenantContext.js';
import crypto from 'crypto';

const router = Router();
router.use(authenticate, tenantContext, validateTenantAccess, requireAdminOrMember);

// GET /api/api-tokens
router.get('/', async (req, res, next) => {
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

// POST /api/api-tokens — create token (returns raw token ONCE)
router.post('/', async (req, res, next) => {
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

    res.status(201).json({ ...token, rawToken }); // rawToken shown only once
  } catch (err) { next(err); }
});

// DELETE /api/api-tokens/:id — revoke
router.delete('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const existing = await prisma.apiToken.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'API token not found' });
    await prisma.apiToken.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
