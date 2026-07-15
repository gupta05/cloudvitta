/**
 * CloudVitta Object Storage Service
 * 
 * Handles bucket CRUD and object operations with:
 * - Oracle Cloud Object Storage backend (S3-compatible API)
 * - Per-tenant/customer logical isolation via key prefixes
 * - Global 15 GB storage cap (configurable via GLOBAL_STORAGE_CAP_GB env)
 * - Per-plan storage quotas (Free: 500 MB, Pro: 1 GB)
 * - Automatic usage metering on every operation
 * - SHA-256 checksum verification
 */

import fs from 'fs/promises';
import crypto from 'crypto';
import { recordStorageEvent } from './storageMeter.js';
import {
  s3Client,
  OCI_BUCKET,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  buildObjectKey,
  buildBucketPrefix,
} from './ociStorageClient.js';

// Global storage cap in bytes (default 15 GB)
const GLOBAL_STORAGE_CAP_GB = parseFloat(process.env.GLOBAL_STORAGE_CAP_GB || '15');
const GLOBAL_STORAGE_CAP_BYTES = BigInt(Math.round(GLOBAL_STORAGE_CAP_GB * 1024 * 1024 * 1024));

// ─── Bucket Operations ──────────────────────────────────────

/**
 * Create a new storage bucket.
 * Buckets are logical — they map to key prefixes in OCI, not separate OCI buckets.
 */
export async function createBucket(prisma, tenantId, customerId, { name, region, isPublic, quotaBytes }) {
  // Validate bucket name (S3-like rules)
  if (!name || !/^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$/.test(name)) {
    throw Object.assign(new Error('Bucket name must be 3-63 characters, lowercase alphanumeric, dots, hyphens, underscores'), { status: 400 });
  }

  // Check customer exists and belongs to tenant
  const customer = await prisma.customer.findFirst({
    where: { id: customerId, tenantId },
  });
  if (!customer) {
    throw Object.assign(new Error('Customer not found'), { status: 404 });
  }

  // Create bucket in DB (no filesystem directory needed — it's a logical prefix)
  const bucket = await prisma.storageBucket.create({
    data: {
      tenantId,
      customerId,
      name,
      region: region || 'ap-mumbai-1',
      isPublic: isPublic || false,
      quotaBytes: quotaBytes ? BigInt(quotaBytes) : null,
    },
  });

  return bucket;
}

/**
 * List buckets for a customer.
 */
export async function listBuckets(prisma, tenantId, customerId) {
  const where = { tenantId };
  if (customerId) where.customerId = customerId;

  const buckets = await prisma.storageBucket.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true } },
      _count: { select: { objects: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  return buckets.map(b => ({
    ...b,
    usedBytes: Number(b.usedBytes),
    quotaBytes: b.quotaBytes ? Number(b.quotaBytes) : null,
  }));
}

/**
 * Get bucket details.
 */
export async function getBucket(prisma, tenantId, bucketId) {
  const bucket = await prisma.storageBucket.findFirst({
    where: { id: bucketId, tenantId },
    include: {
      customer: { select: { id: true, name: true, email: true } },
      _count: { select: { objects: true } },
    },
  });
  if (!bucket) {
    throw Object.assign(new Error('Bucket not found'), { status: 404 });
  }
  return {
    ...bucket,
    usedBytes: Number(bucket.usedBytes),
    quotaBytes: bucket.quotaBytes ? Number(bucket.quotaBytes) : null,
  };
}

/**
 * Delete a bucket (must be empty).
 * Removes the logical prefix from OCI if any orphan objects remain.
 */
export async function deleteBucket(prisma, tenantId, bucketId) {
  const bucket = await prisma.storageBucket.findFirst({
    where: { id: bucketId, tenantId },
  });
  if (!bucket) {
    throw Object.assign(new Error('Bucket not found'), { status: 404 });
  }

  const objectCount = await prisma.storageObject.count({
    where: { bucketId, isDeleted: false },
  });
  if (objectCount > 0) {
    throw Object.assign(new Error(`Bucket is not empty (${objectCount} objects). Delete all objects first.`), { status: 409 });
  }

  // Clean up any orphan objects in OCI under this bucket's prefix
  const prefix = buildBucketPrefix(bucket.tenantId, bucket.customerId, bucket.name);
  try {
    let continuationToken;
    do {
      const listResp = await s3Client.send(new ListObjectsV2Command({
        Bucket: OCI_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }));
      if (listResp.Contents && listResp.Contents.length > 0) {
        await s3Client.send(new DeleteObjectsCommand({
          Bucket: OCI_BUCKET,
          Delete: {
            Objects: listResp.Contents.map(obj => ({ Key: obj.Key })),
            Quiet: true,
          },
        }));
      }
      continuationToken = listResp.NextContinuationToken;
    } while (continuationToken);
  } catch (e) {
    console.warn(`[Storage] Failed to clean OCI prefix ${prefix}:`, e.message);
  }

  // Remove from DB (cascade deletes soft-deleted objects)
  await prisma.storageBucket.delete({ where: { id: bucketId } });

  return { deleted: true };
}

// ─── Object Operations ──────────────────────────────────────

/**
 * Upload an object to a bucket via Oracle Cloud Object Storage.
 * Enforces: global 15 GB cap → plan hard cap → bucket quota.
 * Automatically meters: storage_put_ops, storage_ingress_bytes, storage_bytes_stored
 */
export async function uploadObject(prisma, tenantId, bucket, file, objectKey, userMetadata = {}) {
  const newSize = BigInt(file.size);

  // ── GUARD 1: Global platform storage cap (15 GB all users combined) ──
  const globalAgg = await prisma.storageBucket.aggregate({
    _sum: { usedBytes: true },
  });
  const globalUsed = BigInt(globalAgg._sum.usedBytes || 0);
  if (globalUsed + newSize > GLOBAL_STORAGE_CAP_BYTES) {
    throw Object.assign(
      new Error(
        `Platform storage limit reached. The system has a maximum of ${GLOBAL_STORAGE_CAP_GB} GB total storage. ` +
        `Currently using ${(Number(globalUsed) / (1024 ** 3)).toFixed(2)} GB across all users.`
      ),
      { status: 507 } // 507 Insufficient Storage
    );
  }

  // ── GUARD 2: Plan-level hard cap (e.g., Free = 500 MB, Pro = 1 GB) ──
  const activeSub = await prisma.subscription.findFirst({
    where: { tenantId, customerId: bucket.customerId, status: { in: ['ACTIVE', 'TRIAL'] } },
    include: { planVersion: { include: { priceComponents: { include: { billableMetric: true } } } } },
  });
  if (activeSub) {
    const storageComponent = activeSub.planVersion.priceComponents.find(
      pc => pc.billableMetric?.code === 'storage_bytes_stored'
    );
    if (storageComponent) {
      const pricing = JSON.parse(storageComponent.pricingModel || '{}');
      if (pricing.hardCapGB) {
        const hardCapBytes = BigInt(Math.round(pricing.hardCapGB * 1024 * 1024 * 1024));
        // Sum all storage used by this customer across all their buckets
        const totalAgg = await prisma.storageBucket.aggregate({
          where: { customerId: bucket.customerId, tenantId },
          _sum: { usedBytes: true },
        });
        const totalUsed = BigInt(totalAgg._sum.usedBytes || 0);
        if (totalUsed + newSize > hardCapBytes) {
          throw Object.assign(
            new Error(
              `Storage limit reached. Your plan allows a maximum of ${pricing.hardCapGB >= 1 ? pricing.hardCapGB + ' GB' : (pricing.hardCapGB * 1024).toFixed(0) + ' MB'}. ` +
              `Currently using ${(Number(totalUsed) / (1024 ** 3)).toFixed(2)} GB.`
            ),
            { status: 413 }
          );
        }
      }
    }
  }

  // ── GUARD 3: Bucket-level quota (if set) ──
  if (bucket.quotaBytes && (bucket.usedBytes + newSize) > bucket.quotaBytes) {
    if (!activeSub) {
      throw Object.assign(
        new Error(`Storage quota exceeded. Bucket limit: ${formatBytes(Number(bucket.quotaBytes))}, used: ${formatBytes(Number(bucket.usedBytes))}, upload: ${formatBytes(file.size)}`),
        { status: 413 }
      );
    }
    // Has subscription without hardCap = allow overage (will be billed)
  }

  // Read file buffer from multer temp file
  const fileBuffer = await fs.readFile(file.path);

  // Calculate SHA-256 checksum
  const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // Build the tenant-isolated OCI object key
  const ociKey = buildObjectKey(tenantId, bucket.customerId, bucket.name, objectKey);

  // Upload to Oracle Cloud Object Storage
  await s3Client.send(new PutObjectCommand({
    Bucket: OCI_BUCKET,
    Key: ociKey,
    Body: fileBuffer,
    ContentType: file.mimetype || 'application/octet-stream',
    Metadata: {
      'x-cloudvitta-tenant': tenantId,
      'x-cloudvitta-customer': bucket.customerId,
      'x-cloudvitta-bucket': bucket.id,
      'x-cloudvitta-checksum': checksum,
    },
  }));

  // Check if object already exists (update vs create)
  const existing = await prisma.storageObject.findFirst({
    where: { bucketId: bucket.id, key: objectKey, isDeleted: false },
  });

  let storageObject;
  if (existing) {
    // Update existing object
    const sizeDiff = newSize - existing.sizeBytes;
    storageObject = await prisma.storageObject.update({
      where: { id: existing.id },
      data: {
        sizeBytes: newSize,
        contentType: file.mimetype || 'application/octet-stream',
        checksum,
        storagePath: ociKey,
        metadata: JSON.stringify(userMetadata),
      },
    });

    // Update bucket stats
    await prisma.storageBucket.update({
      where: { id: bucket.id },
      data: {
        usedBytes: { increment: sizeDiff },
      },
    });
  } else {
    // Create new object
    storageObject = await prisma.storageObject.create({
      data: {
        bucketId: bucket.id,
        key: objectKey,
        sizeBytes: newSize,
        contentType: file.mimetype || 'application/octet-stream',
        checksum,
        storagePath: ociKey,
        metadata: JSON.stringify(userMetadata),
      },
    });

    // Update bucket stats
    await prisma.storageBucket.update({
      where: { id: bucket.id },
      data: {
        usedBytes: { increment: newSize },
        objectCount: { increment: 1 },
      },
    });
  }

  // Auto-meter: PUT operation
  await recordStorageEvent(prisma, tenantId, bucket.customerId, 'storage_put_ops', {
    bucketId: bucket.id,
    objectKey,
    sizeBytes: Number(newSize),
  });

  // Auto-meter: ingress bandwidth
  await recordStorageEvent(prisma, tenantId, bucket.customerId, 'storage_ingress_bytes', {
    bytes: Number(newSize),
    bucketId: bucket.id,
  });

  // Clean up temp file
  try { await fs.unlink(file.path); } catch (e) { /* ignore */ }

  return {
    ...storageObject,
    sizeBytes: Number(storageObject.sizeBytes),
    metadata: JSON.parse(storageObject.metadata || '{}'),
  };
}

/**
 * List objects in a bucket with optional prefix filtering.
 */
export async function listObjects(prisma, tenantId, bucketId, { prefix, page = 1, pageSize = 50 } = {}) {
  const bucket = await prisma.storageBucket.findFirst({
    where: { id: bucketId, tenantId },
  });
  if (!bucket) {
    throw Object.assign(new Error('Bucket not found'), { status: 404 });
  }

  const where = {
    bucketId,
    isDeleted: false,
    ...(prefix && { key: { startsWith: prefix } }),
  };

  const [objects, totalCount] = await Promise.all([
    prisma.storageObject.findMany({
      where,
      orderBy: { key: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.storageObject.count({ where }),
  ]);

  // Auto-meter: GET operation (list counts as GET)
  await recordStorageEvent(prisma, tenantId, bucket.customerId, 'storage_get_ops', {
    bucketId,
    operation: 'LIST',
    prefix: prefix || '',
  });

  return {
    data: objects.map(o => ({
      ...o,
      sizeBytes: Number(o.sizeBytes),
      metadata: JSON.parse(o.metadata || '{}'),
    })),
    totalCount,
    page,
    pageSize,
    totalPages: Math.ceil(totalCount / pageSize),
  };
}

/**
 * Get object metadata (HEAD).
 */
export async function getObjectMeta(prisma, tenantId, bucketId, objectId) {
  const bucket = await prisma.storageBucket.findFirst({
    where: { id: bucketId, tenantId },
  });
  if (!bucket) throw Object.assign(new Error('Bucket not found'), { status: 404 });

  const obj = await prisma.storageObject.findFirst({
    where: { id: objectId, bucketId, isDeleted: false },
  });
  if (!obj) throw Object.assign(new Error('Object not found'), { status: 404 });

  // Auto-meter: GET operation
  await recordStorageEvent(prisma, tenantId, bucket.customerId, 'storage_get_ops', {
    bucketId,
    objectKey: obj.key,
    operation: 'HEAD',
  });

  return {
    ...obj,
    sizeBytes: Number(obj.sizeBytes),
    metadata: JSON.parse(obj.metadata || '{}'),
  };
}

/**
 * Download an object from Oracle Cloud Object Storage.
 * Streams directly from OCI through the backend to the client.
 * Automatically meters: storage_get_ops, storage_egress_bytes
 */
export async function downloadObject(prisma, tenantId, bucketId, objectId) {
  const bucket = await prisma.storageBucket.findFirst({
    where: { id: bucketId, tenantId },
  });
  if (!bucket) throw Object.assign(new Error('Bucket not found'), { status: 404 });

  const obj = await prisma.storageObject.findFirst({
    where: { id: objectId, bucketId, isDeleted: false },
  });
  if (!obj) throw Object.assign(new Error('Object not found'), { status: 404 });

  // Build the OCI key (use storagePath if available, otherwise reconstruct)
  const ociKey = obj.storagePath || buildObjectKey(tenantId, bucket.customerId, bucket.name, obj.key);

  // Stream from Oracle Cloud Object Storage
  const getResp = await s3Client.send(new GetObjectCommand({
    Bucket: OCI_BUCKET,
    Key: ociKey,
  }));

  if (!getResp.Body) {
    throw Object.assign(new Error('Object not found in cloud storage'), { status: 404 });
  }

  // Auto-meter: GET operation
  await recordStorageEvent(prisma, tenantId, bucket.customerId, 'storage_get_ops', {
    bucketId,
    objectKey: obj.key,
    operation: 'GET',
    sizeBytes: Number(obj.sizeBytes),
  });

  // Auto-meter: egress bandwidth
  await recordStorageEvent(prisma, tenantId, bucket.customerId, 'storage_egress_bytes', {
    bytes: Number(obj.sizeBytes),
    bucketId,
  });

  const filename = obj.key.split('/').pop() || obj.key;

  return {
    stream: getResp.Body, // S3 SDK returns a readable stream
    contentType: obj.contentType,
    sizeBytes: Number(obj.sizeBytes),
    filename,
    checksum: obj.checksum,
  };
}

/**
 * Delete an object from Oracle Cloud Object Storage.
 * Automatically meters: storage_delete_ops
 */
export async function deleteObject(prisma, tenantId, bucketId, objectId) {
  const bucket = await prisma.storageBucket.findFirst({
    where: { id: bucketId, tenantId },
  });
  if (!bucket) throw Object.assign(new Error('Bucket not found'), { status: 404 });

  const obj = await prisma.storageObject.findFirst({
    where: { id: objectId, bucketId, isDeleted: false },
  });
  if (!obj) throw Object.assign(new Error('Object not found'), { status: 404 });

  // Build the OCI key
  const ociKey = obj.storagePath || buildObjectKey(tenantId, bucket.customerId, bucket.name, obj.key);

  // Delete from Oracle Cloud Object Storage
  try {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: OCI_BUCKET,
      Key: ociKey,
    }));
  } catch (e) {
    console.warn(`[Storage] Failed to delete OCI object ${ociKey}:`, e.message);
  }

  // Soft delete in DB
  await prisma.storageObject.update({
    where: { id: objectId },
    data: { isDeleted: true },
  });

  // Update bucket stats
  await prisma.storageBucket.update({
    where: { id: bucket.id },
    data: {
      usedBytes: { decrement: obj.sizeBytes },
      objectCount: { decrement: 1 },
    },
  });

  // Auto-meter: DELETE operation
  await recordStorageEvent(prisma, tenantId, bucket.customerId, 'storage_delete_ops', {
    bucketId,
    objectKey: obj.key,
    sizeBytes: Number(obj.sizeBytes),
  });

  return { deleted: true, key: obj.key };
}

/**
 * Format bytes to human-readable string.
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
