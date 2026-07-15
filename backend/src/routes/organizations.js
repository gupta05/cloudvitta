import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';

const router = Router();
router.use(authenticate);

// GET /api/organizations — get current user's organization
router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const org = await prisma.organization.findUnique({
      where: { id: req.user.organizationId },
      include: { tenants: { select: { id: true, name: true, slug: true } } },
    });
    res.json(org);
  } catch (err) { next(err); }
});

// PUT /api/organizations — update organization
router.put('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { name } = req.body;
    const org = await prisma.organization.update({
      where: { id: req.user.organizationId },
      data: { name },
    });
    res.json(org);
  } catch (err) { next(err); }
});

export default router;
