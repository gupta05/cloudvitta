/**
 * Oracle Cloud Object Storage Client (S3-Compatible)
 * 
 * Provides a configured S3 client for Oracle Cloud Object Storage,
 * a tenant-isolated key builder, and a startup health check.
 * 
 * Key format: {tenantId}/{customerId}/{bucketName}/{objectKey}
 */

import {
  S3Client,
  HeadBucketCommand,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

// ─── Client Initialization ──────────────────────────────────

const endpoint = process.env.OCI_S3_ENDPOINT;
const bucketName = process.env.OCI_S3_BUCKET;
const region = process.env.OCI_S3_REGION || 'ap-mumbai-1';
const accessKeyId = process.env.OCI_S3_ACCESS_KEY_ID;
const secretAccessKey = process.env.OCI_S3_SECRET_ACCESS_KEY;

if (!endpoint || !bucketName || !accessKeyId || !secretAccessKey) {
  console.error('❌ Missing OCI Object Storage env vars. Required: OCI_S3_ENDPOINT, OCI_S3_BUCKET, OCI_S3_ACCESS_KEY_ID, OCI_S3_SECRET_ACCESS_KEY');
}

const s3 = new S3Client({
  endpoint,
  region,
  credentials: {
    accessKeyId: accessKeyId || '',
    secretAccessKey: secretAccessKey || '',
  },
  forcePathStyle: true, // Required for OCI S3-compatible API
});

// ─── Exports ─────────────────────────────────────────────────

export { s3 as s3Client };
export const OCI_BUCKET = bucketName;

// Re-export commands for convenience
export {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  HeadObjectCommand,
  HeadBucketCommand,
};

// ─── Key Builder ─────────────────────────────────────────────

/**
 * Build a tenant-isolated object key for OCI storage.
 * Format: {tenantId}/{customerId}/{bucketName}/{objectKey}
 * 
 * @param {string} tenantId 
 * @param {string} customerId 
 * @param {string} bucketName - CloudVitta logical bucket name
 * @param {string} objectKey - Object key within the bucket
 * @returns {string} Full OCI object key
 */
export function buildObjectKey(tenantId, customerId, bucketName, objectKey) {
  const safeTenant = tenantId.replace(/[^a-zA-Z0-9-]/g, '_');
  const safeCustomer = customerId.replace(/[^a-zA-Z0-9-]/g, '_');
  const safeBucket = bucketName.replace(/[^a-zA-Z0-9._-]/g, '_');
  // Sanitize key: remove directory traversal, normalize slashes
  const safeKey = objectKey.replace(/\.\./g, '_').replace(/\\\\/g, '/');
  return `${safeTenant}/${safeCustomer}/${safeBucket}/${safeKey}`;
}

/**
 * Build the prefix for listing all objects in a CloudVitta "bucket".
 * 
 * @param {string} tenantId 
 * @param {string} customerId 
 * @param {string} bucketName 
 * @returns {string} OCI prefix
 */
export function buildBucketPrefix(tenantId, customerId, bucketName) {
  const safeTenant = tenantId.replace(/[^a-zA-Z0-9-]/g, '_');
  const safeCustomer = customerId.replace(/[^a-zA-Z0-9-]/g, '_');
  const safeBucket = bucketName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `${safeTenant}/${safeCustomer}/${safeBucket}/`;
}

// ─── Health Check ────────────────────────────────────────────

/**
 * Verify OCI Object Storage connectivity on startup.
 * Sends a HeadBucket request to confirm the bucket exists and credentials work.
 * 
 * @throws {Error} If the bucket is unreachable or credentials are invalid
 */
export async function verifyOCIConnection() {
  try {
    await s3.send(new HeadBucketCommand({ Bucket: OCI_BUCKET }));
    console.log(`☁️  Oracle Cloud Object Storage connected — bucket: ${OCI_BUCKET}`);
    return true;
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      throw new Error(`OCI bucket "${OCI_BUCKET}" not found. Create it in the OCI Console first.`);
    }
    if (err.$metadata?.httpStatusCode === 403) {
      throw new Error(`OCI credentials rejected (403 Forbidden). Check OCI_S3_ACCESS_KEY_ID and OCI_S3_SECRET_ACCESS_KEY.`);
    }
    throw new Error(`OCI connectivity check failed: ${err.message}`);
  }
}
