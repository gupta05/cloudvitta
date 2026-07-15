/**
 * CloudVitta Portal Notifications Routes
 * In-app notification feed, unread count, mark read, delete
 */

import { Router } from 'express';
import { authenticate, requireUser } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess } from '../middleware/tenantContext.js';

const router = Router();
router.use(authenticate, tenantContext, validateTenantAccess, requireUser);

// GET /api/portal/notifications — list notifications (paginated)
router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { type, isRead, page = 1, limit = 20 } = req.query;

    const where = { userId: req.user.userId };
    if (type) where.type = type;
    if (isRead !== undefined) where.isRead = isRead === 'true';

    const [data, total] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: (parseInt(page) - 1) * parseInt(limit),
      }),
      prisma.notification.count({ where }),
    ]);

    res.json({
      data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) { next(err); }
});

// GET /api/portal/notifications/unread-count
router.get('/unread-count', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const count = await prisma.notification.count({
      where: { userId: req.user.userId, isRead: false },
    });
    res.json({ count });
  } catch (err) { next(err); }
});

// PUT /api/portal/notifications/:id/read — mark one as read
router.put('/:id/read', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const notification = await prisma.notification.findFirst({
      where: { id: req.params.id, userId: req.user.userId },
    });

    if (!notification) return res.status(404).json({ error: 'Notification not found' });

    await prisma.notification.update({
      where: { id: req.params.id },
      data: { isRead: true },
    });

    res.json({ message: 'Marked as read' });
  } catch (err) { next(err); }
});

// PUT /api/portal/notifications/read-all — mark all as read
router.put('/read-all', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    await prisma.notification.updateMany({
      where: { userId: req.user.userId, isRead: false },
      data: { isRead: true },
    });
    res.json({ message: 'All notifications marked as read' });
  } catch (err) { next(err); }
});

// DELETE /api/portal/notifications/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const notification = await prisma.notification.findFirst({
      where: { id: req.params.id, userId: req.user.userId },
    });

    if (!notification) return res.status(404).json({ error: 'Notification not found' });

    await prisma.notification.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
