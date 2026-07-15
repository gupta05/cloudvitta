/**
 * CloudVitta Portal Account Routes
 * Profile management, password change, sessions, account deletion
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { authenticate, requireUser } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess } from '../middleware/tenantContext.js';

const router = Router();
router.use(authenticate, tenantContext, validateTenantAccess, requireUser);

// ─── Profile ────────────────────────────────────────────────

// GET /api/portal/account/profile
router.get('/profile', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        id: true, email: true, displayName: true, phone: true, avatarUrl: true,
        isVerified: true, role: true, lastLoginAt: true, createdAt: true, updatedAt: true,
        customer: { select: { id: true, name: true, alias: true, currency: true } },
        organization: { select: { id: true, name: true } },
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) { next(err); }
});

// PUT /api/portal/account/profile
router.put('/profile', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { displayName, phone } = req.body;

    const updateData = {};
    if (displayName !== undefined) updateData.displayName = displayName.trim();
    if (phone !== undefined) updateData.phone = phone.trim();

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: updateData,
      select: {
        id: true, email: true, displayName: true, phone: true, avatarUrl: true,
        isVerified: true, lastLoginAt: true, createdAt: true, updatedAt: true,
      },
    });

    // Also update customer name if displayName changed
    if (updateData.displayName && req.user.customerId) {
      await prisma.customer.update({
        where: { id: req.user.customerId },
        data: { name: updateData.displayName },
      }).catch(() => {});
    }

    // Create notification
    prisma.notification.create({
      data: {
        userId: req.user.userId,
        type: 'account',
        title: 'Profile updated',
        message: 'Your profile information has been updated successfully.',
      },
    }).catch(() => {});

    res.json(user);
  } catch (err) { next(err); }
});

// ─── Password ───────────────────────────────────────────────

// PUT /api/portal/account/password
router.put('/password', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { passwordHash },
    });

    // Create notification
    prisma.notification.create({
      data: {
        userId: req.user.userId,
        type: 'security',
        title: 'Password changed',
        message: 'Your password has been changed successfully. If this wasn\'t you, contact support immediately.',
      },
    }).catch(() => {});

    res.json({ message: 'Password updated successfully' });
  } catch (err) { next(err); }
});

// ─── Sessions ───────────────────────────────────────────────

// GET /api/portal/account/sessions
router.get('/sessions', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const sessions = await prisma.userSession.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json({
      data: sessions.map((s) => ({
        ...s,
        isCurrent: s.id === req.user.sessionId,
      })),
    });
  } catch (err) { next(err); }
});

// DELETE /api/portal/account/sessions/:id — revoke a session
router.delete('/sessions/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const session = await prisma.userSession.findUnique({
      where: { id: req.params.id },
    });

    if (!session || session.userId !== req.user.userId) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.id === req.user.sessionId) {
      return res.status(400).json({ error: 'Cannot revoke your current session. Use logout instead.' });
    }

    await prisma.userSession.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    res.json({ message: 'Session revoked' });
  } catch (err) { next(err); }
});

// POST /api/portal/account/sessions/revoke-all — revoke all other sessions
router.post('/sessions/revoke-all', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    await prisma.userSession.updateMany({
      where: {
        userId: req.user.userId,
        isActive: true,
        NOT: { id: req.user.sessionId },
      },
      data: { isActive: false },
    });

    res.json({ message: 'All other sessions revoked' });
  } catch (err) { next(err); }
});

// ─── Delete Account ─────────────────────────────────────────

// POST /api/portal/account/delete — hard delete with password confirmation
router.post('/delete', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { password, confirmation } = req.body;

    if (!password) {
      return res.status(400).json({ error: 'Password is required to delete your account' });
    }

    if (confirmation !== 'DELETE') {
      return res.status(400).json({ error: 'Please type DELETE to confirm' });
    }

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(400).json({ error: 'Incorrect password' });
    }

    // Cascade delete: sessions, notifications, preferences, notification prefs
    // then storage objects, storage buckets, invoices, subscriptions, customer, user
    const customerId = user.customerId;
    const tenantId = user.tenantId;

    await prisma.$transaction(async (tx) => {
      // Delete user-level data (cascade handles sessions, notifications, prefs)
      await tx.userSession.deleteMany({ where: { userId: user.id } });
      await tx.notification.deleteMany({ where: { userId: user.id } });
      await tx.notificationPreference.deleteMany({ where: { userId: user.id } });
      await tx.userPreference.deleteMany({ where: { userId: user.id } });

      if (customerId && tenantId) {
        // Delete storage objects
        const buckets = await tx.storageBucket.findMany({
          where: { customerId, tenantId },
          select: { id: true },
        });
        const bucketIds = buckets.map(b => b.id);
        if (bucketIds.length > 0) {
          await tx.storageObject.deleteMany({ where: { bucketId: { in: bucketIds } } });
          await tx.storageBucket.deleteMany({ where: { id: { in: bucketIds } } });
        }
        await tx.storageSnapshot.deleteMany({ where: { customerId, tenantId } });

        // Delete billing data
        const invoices = await tx.invoice.findMany({
          where: { customerId, tenantId },
          select: { id: true },
        });
        const invoiceIds = invoices.map(i => i.id);
        if (invoiceIds.length > 0) {
          await tx.invoiceLine.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
          await tx.creditNote.deleteMany({ where: { invoiceId: { in: invoiceIds } } });
          await tx.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
        }

        // Delete subscriptions
        const subs = await tx.subscription.findMany({
          where: { customerId, tenantId },
          select: { id: true },
        });
        const subIds = subs.map(s => s.id);
        if (subIds.length > 0) {
          await tx.subscriptionComponent.deleteMany({ where: { subscriptionId: { in: subIds } } });
          await tx.subscriptionAddon.deleteMany({ where: { subscriptionId: { in: subIds } } });
          await tx.subscription.deleteMany({ where: { id: { in: subIds } } });
        }

        // Delete usage events and API tokens
        await tx.usageEvent.deleteMany({ where: { customerId, tenantId } });
        await tx.apiToken.deleteMany({ where: { tenantId } });
        await tx.paymentMethod.deleteMany({ where: { customerId } });

        // Delete customer
        await tx.customer.delete({ where: { id: customerId } });
      }

      // Delete user
      await tx.user.delete({ where: { id: user.id } });
    });

    res.json({ message: 'Account deleted successfully' });
  } catch (err) { next(err); }
});

export default router;
