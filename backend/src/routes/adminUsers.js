/**
 * CloudVitta Admin User Management Routes
 * List, view, update, and delete users across the platform
 */

import { Router } from 'express';
import { authenticate, requireAdminOrMember } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess } from '../middleware/tenantContext.js';

const router = Router();
router.use(authenticate, tenantContext, validateTenantAccess, requireAdminOrMember);

// GET /api/users — list all users
router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { role, status, search, page = 1, limit = 25 } = req.query;

    const where = { organizationId: req.user.organizationId };

    if (role) where.role = role;
    if (status === 'active') where.deactivatedAt = null;
    if (status === 'deactivated') where.deactivatedAt = { not: null };
    if (search) {
      where.OR = [
        { email: { contains: search } },
        { displayName: { contains: search } },
      ];
    }

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true, email: true, displayName: true, role: true, phone: true,
          isVerified: true, lastLoginAt: true, deactivatedAt: true,
          createdAt: true, updatedAt: true,
          tenantId: true,
          customerId: true,
          tenant: { select: { id: true, name: true } },
          customer: { select: { id: true, name: true, alias: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: (parseInt(page) - 1) * parseInt(limit),
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      data: users,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) { next(err); }
});

// GET /api/users/:id — user detail with summary data
router.get('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, organizationId: req.user.organizationId },
      select: {
        id: true, email: true, displayName: true, role: true, phone: true,
        isVerified: true, lastLoginAt: true, deactivatedAt: true,
        createdAt: true, updatedAt: true,
        tenantId: true, customerId: true, organizationId: true,
        tenant: { select: { id: true, name: true } },
        customer: {
          select: {
            id: true, name: true, alias: true, email: true, currency: true,
            balanceCents: true, createdAt: true,
          },
        },
        organization: { select: { id: true, name: true } },
      },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Gather summary data
    const summaryData = {};

    if (user.customerId && user.tenantId) {
      const [subCount, bucketCount, invoiceCount, totalStorage] = await Promise.all([
        prisma.subscription.count({
          where: { customerId: user.customerId, tenantId: user.tenantId },
        }),
        prisma.storageBucket.count({
          where: { customerId: user.customerId, tenantId: user.tenantId },
        }),
        prisma.invoice.count({
          where: { customerId: user.customerId, tenantId: user.tenantId },
        }),
        prisma.storageBucket.aggregate({
          where: { customerId: user.customerId, tenantId: user.tenantId },
          _sum: { usedBytes: true },
        }),
      ]);

      summaryData.subscriptions = subCount;
      summaryData.buckets = bucketCount;
      summaryData.invoices = invoiceCount;
      summaryData.totalStorageBytes = Number(totalStorage._sum.usedBytes || 0);
    }

    // Get session count
    summaryData.activeSessions = await prisma.userSession.count({
      where: { userId: user.id, isActive: true },
    });

    res.json({ ...user, summary: summaryData });
  } catch (err) { next(err); }
});

// PUT /api/users/:id — update user (role, deactivate/reactivate)
router.put('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { role, deactivate } = req.body;

    const user = await prisma.user.findFirst({
      where: { id: req.params.id, organizationId: req.user.organizationId },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    // Prevent self-demotion
    if (user.id === req.user.userId && role && role !== user.role) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const updateData = {};
    if (role && ['admin', 'member', 'user'].includes(role)) updateData.role = role;
    if (deactivate === true) updateData.deactivatedAt = new Date();
    if (deactivate === false) updateData.deactivatedAt = null;

    // If deactivating, also invalidate all sessions
    if (deactivate === true) {
      await prisma.userSession.updateMany({
        where: { userId: user.id, isActive: true },
        data: { isActive: false },
      });
    }

    const updated = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      select: {
        id: true, email: true, displayName: true, role: true,
        isVerified: true, deactivatedAt: true, lastLoginAt: true,
        createdAt: true, updatedAt: true,
      },
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// DELETE /api/users/:id — hard delete user (admin-only cascade)
router.delete('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;

    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can delete users' });
    }

    const user = await prisma.user.findFirst({
      where: { id: req.params.id, organizationId: req.user.organizationId },
    });

    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.id === req.user.userId) {
      return res.status(400).json({ error: 'Cannot delete your own account from admin panel' });
    }

    await prisma.$transaction(async (tx) => {
      await tx.userSession.deleteMany({ where: { userId: user.id } });
      await tx.notification.deleteMany({ where: { userId: user.id } });
      await tx.notificationPreference.deleteMany({ where: { userId: user.id } });
      await tx.userPreference.deleteMany({ where: { userId: user.id } });

      if (user.customerId && user.tenantId) {
        const buckets = await tx.storageBucket.findMany({
          where: { customerId: user.customerId, tenantId: user.tenantId },
          select: { id: true },
        });
        const bucketIds = buckets.map(b => b.id);
        if (bucketIds.length > 0) {
          await tx.storageObject.deleteMany({ where: { bucketId: { in: bucketIds } } });
          await tx.storageBucket.deleteMany({ where: { id: { in: bucketIds } } });
        }
        await tx.storageSnapshot.deleteMany({ where: { customerId: user.customerId, tenantId: user.tenantId } });

        const invoices = await tx.invoice.findMany({
          where: { customerId: user.customerId, tenantId: user.tenantId },
          select: { id: true },
        });
        const invoiceIds = invoices.map(i => i.id);
        if (invoiceIds.length > 0) {
          await tx.invoiceLine.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
          await tx.creditNote.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
          await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
        }

        const subs = await tx.subscription.findMany({
          where: { customerId: user.customerId, tenantId: user.tenantId },
          select: { id: true },
        });
        const subIds = subs.map(s => s.id);
        if (subIds.length > 0) {
          await tx.subscriptionComponent.deleteMany({ where: { subscriptionId: { in: subIds } } });
          await tx.subscriptionAddon.deleteMany({ where: { subscriptionId: { in: subIds } } });
          await tx.subscription.deleteMany({ where: { id: { in: subIds } } });
        }

        await tx.usageEvent.deleteMany({ where: { customerId: user.customerId, tenantId: user.tenantId } });
        await tx.apiToken.deleteMany({ where: { tenantId: user.tenantId } });
        await tx.paymentMethod.deleteMany({ where: { customerId: user.customerId } });
        await tx.customer.delete({ where: { id: user.customerId } });
      }

      await tx.user.delete({ where: { id: user.id } });
    });

    res.status(204).send();
  } catch (err) { next(err); }
});

// GET /api/users/:id/sessions — view user's sessions
router.get('/:id/sessions', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, organizationId: req.user.organizationId },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const sessions = await prisma.userSession.findMany({
      where: { userId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ data: sessions });
  } catch (err) { next(err); }
});

// GET /api/users/:id/notifications — view user's notifications
router.get('/:id/notifications', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const user = await prisma.user.findFirst({
      where: { id: req.params.id, organizationId: req.user.organizationId },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const notifications = await prisma.notification.findMany({
      where: { userId: req.params.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.json({ data: notifications });
  } catch (err) { next(err); }
});

export default router;
