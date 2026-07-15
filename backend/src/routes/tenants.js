import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// GET /api/tenants — list tenants for current org
router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const tenants = await prisma.tenant.findMany({
      where: { organizationId: req.user.organizationId },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ data: tenants });
  } catch (err) { next(err); }
});

// POST /api/tenants — create a new tenant
router.post('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { name, currency } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const tenant = await prisma.tenant.create({
      data: { name, slug, currency: currency || 'INR', organizationId: req.user.organizationId },
    });
    res.status(201).json(tenant);
  } catch (err) { next(err); }
});

// GET /api/tenants/:id
router.get('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const tenant = await prisma.tenant.findFirst({
      where: { id: req.params.id, organizationId: req.user.organizationId },
    });
    if (!tenant) return res.status(404).json({ error: 'Tenant not found' });
    res.json(tenant);
  } catch (err) { next(err); }
});

export default router;
