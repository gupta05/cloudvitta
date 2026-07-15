/**
 * CloudVitta Object Storage API Routes
 * 
 * REST API for bucket and object management with automatic metering.
 */

import { Router } from 'express';
import multer from 'multer';
import os from 'os';
import path from 'path';
import { authenticate } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess, customerScope } from '../middleware/tenantContext.js';
import {
  createBucket, listBuckets, getBucket, deleteBucket,
  uploadObject, listObjects, getObjectMeta, downloadObject, deleteObject,
} from '../services/storageService.js';
import { getStorageUsageSummary } from '../services/storageMeter.js';

const router = Router();
router.use(authenticate, tenantContext, validateTenantAccess, customerScope);

// Configure multer for file uploads (temp dir)
const upload = multer({
  dest: path.join(os.tmpdir(), 'cloudvitta-uploads'),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
});

// ─── Bucket Routes ──────────────────────────────────────────

// POST /api/storage/buckets — create bucket
router.post('/buckets', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { name, region, isPublic, quotaBytes } = req.body;
    // End-users: auto-scope to their customer. Admins: must specify customerId.
    const customerId = req.customerId || req.body.customerId;
    if (!name || !customerId) {
      return res.status(400).json({ error: 'name and customerId are required' });
    }
    const bucket = await createBucket(prisma, req.tenantId, customerId, { name, region, isPublic, quotaBytes });
    res.status(201).json({
      ...bucket,
      usedBytes: Number(bucket.usedBytes),
      quotaBytes: bucket.quotaBytes ? Number(bucket.quotaBytes) : null,
    });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// GET /api/storage/buckets — list buckets
router.get('/buckets', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    // End-users: auto-scoped via req.customerId. Admins: optional filter.
    const customerId = req.customerId || req.query.customerId;
    const buckets = await listBuckets(prisma, req.tenantId, customerId);
    res.json({ data: buckets });
  } catch (err) { next(err); }
});

// GET /api/storage/buckets/:bucketId — get bucket details
router.get('/buckets/:bucketId', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const bucket = await getBucket(prisma, req.tenantId, req.params.bucketId);
    // End-users: verify the bucket belongs to them
    if (req.customerId && bucket.customerId !== req.customerId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json(bucket);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// DELETE /api/storage/buckets/:bucketId — delete bucket
router.delete('/buckets/:bucketId', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const result = await deleteBucket(prisma, req.tenantId, req.params.bucketId);
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// ─── Object Routes ──────────────────────────────────────────

// POST /api/storage/buckets/:bucketId/objects — upload object
router.post('/buckets/:bucketId/objects', upload.single('file'), async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    if (!req.file) {
      return res.status(400).json({ error: 'file is required' });
    }

    const bucket = await getBucket(prisma, req.tenantId, req.params.bucketId);

    // Customer isolation: portal users can only upload to their own buckets
    if (req.customerId && bucket.customerId !== req.customerId) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const objectKey = req.body.key || req.file.originalname;
    const metadata = req.body.metadata ? JSON.parse(req.body.metadata) : {};

    const obj = await uploadObject(prisma, req.tenantId, bucket, req.file, objectKey, metadata);
    res.status(201).json(obj);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// GET /api/storage/buckets/:bucketId/objects — list objects
router.get('/buckets/:bucketId/objects', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { prefix, page, pageSize } = req.query;
    const result = await listObjects(prisma, req.tenantId, req.params.bucketId, {
      prefix,
      page: parseInt(page) || 1,
      pageSize: parseInt(pageSize) || 50,
    });
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// GET /api/storage/buckets/:bucketId/objects/:objectId — download object
router.get('/buckets/:bucketId/objects/:objectId', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { stream, contentType, sizeBytes, filename, checksum } = await downloadObject(
      prisma, req.tenantId, req.params.bucketId, req.params.objectId
    );

    // Sanitize filename to prevent Content-Disposition header injection
    const safeFilename = filename.replace(/[\r\n"\\]/g, '_').replace(/[^\x20-\x7E]/g, '_');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', sizeBytes);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('ETag', `"${checksum}"`);
    res.setHeader('X-Checksum-SHA256', checksum);

    stream.pipe(res);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// HEAD /api/storage/buckets/:bucketId/objects/:objectId — get object metadata
router.head('/buckets/:bucketId/objects/:objectId', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const meta = await getObjectMeta(prisma, req.tenantId, req.params.bucketId, req.params.objectId);
    res.setHeader('Content-Type', meta.contentType);
    res.setHeader('Content-Length', meta.sizeBytes);
    res.setHeader('ETag', `"${meta.checksum}"`);
    res.setHeader('X-Object-Id', meta.id);
    res.setHeader('X-Object-Key', meta.key);
    res.status(200).end();
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// GET /api/storage/buckets/:bucketId/objects/:objectId/meta — get object metadata as JSON
router.get('/buckets/:bucketId/objects/:objectId/meta', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const meta = await getObjectMeta(prisma, req.tenantId, req.params.bucketId, req.params.objectId);
    res.json(meta);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// DELETE /api/storage/buckets/:bucketId/objects/:objectId — delete object
router.delete('/buckets/:bucketId/objects/:objectId', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    // Customer isolation: portal users can only delete from their own buckets
    if (req.customerId) {
      const bucket = await getBucket(prisma, req.tenantId, req.params.bucketId);
      if (bucket.customerId !== req.customerId) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    const result = await deleteObject(prisma, req.tenantId, req.params.bucketId, req.params.objectId);
    res.json(result);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// ─── Storage Usage Routes ───────────────────────────────────

// GET /api/storage/usage — real-time storage usage for a customer
router.get('/usage', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    // End-users: auto-scoped to their customer. Admins: must pass ?customerId=
    const customerId = req.customerId || req.query.customerId;
    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }
    const { periodStart, periodEnd } = req.query;
    const start = periodStart ? new Date(periodStart) : new Date(Date.now() - 30 * 86400000);
    const end = periodEnd ? new Date(periodEnd) : new Date();
    const usage = await getStorageUsageSummary(prisma, req.tenantId, customerId, start, end);
    res.json(usage);
  } catch (err) { next(err); }
});

// GET /api/storage/usage/history — historical usage snapshots
router.get('/usage/history', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { bucketId, days } = req.query;
    // End-users: auto-scoped to their customer. Admins: must pass ?customerId=
    const customerId = req.customerId || req.query.customerId;
    if (!customerId) {
      return res.status(400).json({ error: 'customerId is required' });
    }

    const daysBack = parseInt(days) || 30;
    const since = new Date(Date.now() - daysBack * 86400000);

    const where = {
      tenantId: req.tenantId,
      customerId,
      snapshotTime: { gte: since },
    };
    if (bucketId) where.bucketId = bucketId;
    else where.bucketId = null; // aggregate snapshots only

    const snapshots = await prisma.storageSnapshot.findMany({
      where,
      orderBy: { snapshotTime: 'asc' },
      take: 1000,
    });

    res.json({
      data: snapshots.map(s => ({
        ...s,
        usedBytes: Number(s.usedBytes),
        usedGB: Math.round(Number(s.usedBytes) / (1024 * 1024 * 1024) * 1000) / 1000,
      })),
      totalCount: snapshots.length,
    });
  } catch (err) { next(err); }
});

// GET /api/storage/stats — aggregate storage stats (scoped by customer for end-users)
router.get('/stats', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const tenantId = req.tenantId;
    // Build customer filter: end-users see only their data
    const bucketWhere = { tenantId };
    const eventWhere = {
      tenantId,
      eventCode: { in: ['storage_put_ops', 'storage_get_ops', 'storage_delete_ops'] },
      timestamp: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    };
    if (req.customerId) {
      bucketWhere.customerId = req.customerId;
      eventWhere.customerId = req.customerId;
    }

    // Egress/ingress bandwidth (internal infra metric, last 30d)
    const bandwidthWhere = {
      tenantId,
      eventCode: 'storage_egress_bytes',
      timestamp: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
    };
    const ingressWhere = { ...bandwidthWhere, eventCode: 'storage_ingress_bytes' };
    if (req.customerId) { bandwidthWhere.customerId = req.customerId; ingressWhere.customerId = req.customerId; }

    const [totalBuckets, totalObjects, allBuckets, buckets, recentEvents, egressEvents, ingressEvents] = await Promise.all([
      prisma.storageBucket.count({ where: bucketWhere }),
      prisma.storageObject.count({ where: { bucket: bucketWhere, isDeleted: false } }),
      // True total across ALL buckets (not just the top 10 shown below).
      prisma.storageBucket.findMany({ where: bucketWhere, select: { usedBytes: true } }),
      prisma.storageBucket.findMany({
        where: bucketWhere,
        select: { id: true, name: true, usedBytes: true, objectCount: true, customerId: true, customer: { select: { name: true } } },
        orderBy: { usedBytes: 'desc' },
        take: 10,
      }),
      prisma.usageEvent.count({ where: eventWhere }),
      prisma.usageEvent.findMany({ where: bandwidthWhere, select: { properties: true } }),
      prisma.usageEvent.findMany({ where: ingressWhere, select: { properties: true } }),
    ]);

    const totalBytes = allBuckets.reduce((sum, b) => sum + Number(b.usedBytes), 0);
    const sumBytes = (events) => events.reduce((sum, e) => {
      const props = JSON.parse(e.properties || '{}');
      return sum + (parseFloat(props.bytes) || 0);
    }, 0);
    const totalEgressBytes = sumBytes(egressEvents);
    const totalIngressBytes = sumBytes(ingressEvents);

    res.json({
      totalBuckets,
      totalObjects,
      totalBytes,
      totalGB: Math.round(totalBytes / (1024 * 1024 * 1024) * 1000) / 1000,
      operationsLast24h: recentEvents,
      // Internal infrastructure metric — bandwidth is not billed to customers.
      totalEgressBytes,
      totalEgressGB: Math.round(totalEgressBytes / (1024 * 1024 * 1024) * 1000) / 1000,
      totalIngressBytes,
      totalIngressGB: Math.round(totalIngressBytes / (1024 * 1024 * 1024) * 1000) / 1000,
      topBuckets: buckets.map(b => ({
        ...b,
        usedBytes: Number(b.usedBytes),
        usedGB: Math.round(Number(b.usedBytes) / (1024 * 1024 * 1024) * 1000) / 1000,
      })),
    });
  } catch (err) { next(err); }
});

export default router;
