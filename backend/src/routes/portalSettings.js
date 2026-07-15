/**
 * CloudVitta Portal Settings Routes
 * User preferences and notification preferences
 */

import { Router } from 'express';
import { authenticate, requireUser } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess } from '../middleware/tenantContext.js';

const router = Router();
router.use(authenticate, tenantContext, validateTenantAccess, requireUser);

// ─── Preferences ────────────────────────────────────────────

// GET /api/portal/settings/preferences
router.get('/preferences', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    let prefs = await prisma.userPreference.findUnique({
      where: { userId: req.user.userId },
    });

    // Auto-create if missing
    if (!prefs) {
      prefs = await prisma.userPreference.create({
        data: { userId: req.user.userId },
      });
    }

    res.json(prefs);
  } catch (err) { next(err); }
});

// PUT /api/portal/settings/preferences
router.put('/preferences', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { timezone, dateFormat, storageRegion, defaultBucketVisibility } = req.body;

    const validTimezones = [
      'UTC', 'US/Eastern', 'US/Central', 'US/Mountain', 'US/Pacific',
      'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo',
      'Asia/Shanghai', 'Asia/Kolkata', 'Australia/Sydney', 'America/Sao_Paulo',
      'Africa/Cairo', 'Pacific/Auckland',
    ];

    const validDateFormats = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'];
    const validRegions = ['us-east-1', 'us-west-2', 'eu-west-1', 'ap-south-1', 'ap-northeast-1'];
    const validVisibilities = ['private', 'public'];

    const updateData = {};
    if (timezone && validTimezones.includes(timezone)) updateData.timezone = timezone;
    if (dateFormat && validDateFormats.includes(dateFormat)) updateData.dateFormat = dateFormat;
    if (storageRegion && validRegions.includes(storageRegion)) updateData.storageRegion = storageRegion;
    if (defaultBucketVisibility && validVisibilities.includes(defaultBucketVisibility)) {
      updateData.defaultBucketVisibility = defaultBucketVisibility;
    }

    const prefs = await prisma.userPreference.upsert({
      where: { userId: req.user.userId },
      update: updateData,
      create: { userId: req.user.userId, ...updateData },
    });

    res.json(prefs);
  } catch (err) { next(err); }
});

// ─── Notification Preferences ───────────────────────────────

// GET /api/portal/settings/notifications
router.get('/notifications', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    let prefs = await prisma.notificationPreference.findUnique({
      where: { userId: req.user.userId },
    });

    if (!prefs) {
      prefs = await prisma.notificationPreference.create({
        data: { userId: req.user.userId },
      });
    }

    res.json(prefs);
  } catch (err) { next(err); }
});

// PUT /api/portal/settings/notifications
router.put('/notifications', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const allowedFields = [
      'invoiceCreated', 'paymentReceived', 'paymentFailed', 'subscriptionChange',
      'storageWarning75', 'storageWarning90', 'storageQuotaFull', 'uploadComplete',
      'newLogin', 'passwordChanged', 'apiKeyCreated',
      'accountUpdates', 'productNews',
    ];

    const updateData = {};
    for (const field of allowedFields) {
      if (typeof req.body[field] === 'boolean') {
        updateData[field] = req.body[field];
      }
    }

    const prefs = await prisma.notificationPreference.upsert({
      where: { userId: req.user.userId },
      update: updateData,
      create: { userId: req.user.userId, ...updateData },
    });

    res.json(prefs);
  } catch (err) { next(err); }
});

export default router;
