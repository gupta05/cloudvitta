import { Router } from 'express';
import { authenticate, requireAdminOrMember } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess } from '../middleware/tenantContext.js';
import crypto from 'crypto';

const router = Router();
router.use(authenticate, tenantContext, validateTenantAccess, requireAdminOrMember);

// GET /api/webhooks
router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { tenantId: req.tenantId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: endpoints.map((e) => ({ ...e, events: JSON.parse(e.events || '[]') })) });
  } catch (err) { next(err); }
});

// POST /api/webhooks
router.post('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { url, events } = req.body;
    if (!url) return res.status(400).json({ error: 'url is required' });
    const secret = `whsec_${crypto.randomBytes(24).toString('hex')}`;
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        tenantId: req.tenantId, url, secret,
        events: JSON.stringify(events || ['*']),
      },
    });
    res.status(201).json({ ...endpoint, events: JSON.parse(endpoint.events) });
  } catch (err) { next(err); }
});

// PUT /api/webhooks/:id
router.put('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { url, events, isActive } = req.body;
    const existing = await prisma.webhookEndpoint.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Webhook endpoint not found' });
    const endpoint = await prisma.webhookEndpoint.update({
      where: { id: req.params.id },
      data: {
        ...(url && { url }),
        ...(events && { events: JSON.stringify(events) }),
        ...(isActive !== undefined && { isActive }),
      },
    });
    res.json({ ...endpoint, events: JSON.parse(endpoint.events) });
  } catch (err) { next(err); }
});

// DELETE /api/webhooks/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const existing = await prisma.webhookEndpoint.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Webhook endpoint not found' });
    await prisma.webhookEndpoint.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
