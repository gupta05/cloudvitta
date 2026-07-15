/**
 * CloudVitta Storage Metering Service
 * 
 * Automatically records usage events for every storage operation.
 * Provides GB-hour calculation from periodic snapshots for accurate billing.
 */

/**
 * Record a storage usage event automatically.
 * Called internally by storageService on every file operation.
 */
export async function recordStorageEvent(prisma, tenantId, customerId, eventCode, properties = {}) {
  await prisma.usageEvent.create({
    data: {
      tenantId,
      customerId,
      eventCode,
      timestamp: new Date(),
      properties: JSON.stringify(properties),
    },
  });
}

/**
 * Snapshot current storage usage for all customers.
 * Called by scheduler every 15 minutes for accurate GB-hour billing.
 */
export async function snapshotStorageUsage(prisma) {
  // Get all buckets grouped by tenant+customer
  const buckets = await prisma.storageBucket.findMany({
    select: {
      id: true,
      tenantId: true,
      customerId: true,
      usedBytes: true,
      objectCount: true,
    },
  });

  // Group by tenant+customer
  const grouped = {};
  for (const b of buckets) {
    const key = `${b.tenantId}::${b.customerId}`;
    if (!grouped[key]) {
      grouped[key] = { tenantId: b.tenantId, customerId: b.customerId, totalBytes: BigInt(0), totalObjects: 0, buckets: [] };
    }
    grouped[key].totalBytes += b.usedBytes;
    grouped[key].totalObjects += b.objectCount;
    grouped[key].buckets.push(b);
  }

  const now = new Date();
  const snapshots = [];

  for (const entry of Object.values(grouped)) {
    // Create aggregate snapshot per customer
    snapshots.push({
      tenantId: entry.tenantId,
      customerId: entry.customerId,
      bucketId: null,
      usedBytes: entry.totalBytes,
      objectCount: entry.totalObjects,
      snapshotTime: now,
    });

    // Also create per-bucket snapshots
    for (const b of entry.buckets) {
      snapshots.push({
        tenantId: entry.tenantId,
        customerId: entry.customerId,
        bucketId: b.id,
        usedBytes: b.usedBytes,
        objectCount: b.objectCount,
        snapshotTime: now,
      });
    }
  }

  if (snapshots.length > 0) {
    await prisma.storageSnapshot.createMany({ data: snapshots });
  }

  return { snapshotCount: snapshots.length, customerCount: Object.keys(grouped).length };
}

/**
 * Calculate time-weighted average storage in GB for a billing period.
 * Uses StorageSnapshot data for accurate GB-hour → GB-month billing.
 * 
 * Returns: { avgGB, peakGB, gbHours, snapshotCount }
 */
export async function calculateGBHours(prisma, tenantId, customerId, periodStart, periodEnd) {
  const snapshots = await prisma.storageSnapshot.findMany({
    where: {
      tenantId,
      customerId,
      bucketId: null, // aggregate snapshots only
      snapshotTime: { gte: periodStart, lte: periodEnd },
    },
    orderBy: { snapshotTime: 'asc' },
  });

  if (snapshots.length === 0) {
    // Fallback: check current bucket state
    const buckets = await prisma.storageBucket.findMany({
      where: { tenantId, customerId },
      select: { usedBytes: true },
    });
    const totalBytes = buckets.reduce((sum, b) => sum + Number(b.usedBytes), 0);
    const totalGB = totalBytes / (1024 * 1024 * 1024);
    const periodHours = (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60);
    return {
      avgGB: Math.round(totalGB * 100) / 100,
      peakGB: Math.round(totalGB * 100) / 100,
      gbHours: Math.round(totalGB * periodHours * 100) / 100,
      snapshotCount: 0,
    };
  }

  // Calculate time-weighted average
  let totalGBHours = 0;
  let peakGB = 0;

  for (let i = 0; i < snapshots.length; i++) {
    const current = snapshots[i];
    const currentGB = Number(current.usedBytes) / (1024 * 1024 * 1024);
    peakGB = Math.max(peakGB, currentGB);

    // Time span: from this snapshot to the next (or period end)
    const nextTime = i + 1 < snapshots.length
      ? snapshots[i + 1].snapshotTime
      : periodEnd;
    const hours = (nextTime.getTime() - current.snapshotTime.getTime()) / (1000 * 60 * 60);
    totalGBHours += currentGB * hours;
  }

  const totalPeriodHours = (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60);
  const avgGB = totalPeriodHours > 0 ? totalGBHours / totalPeriodHours : 0;

  return {
    avgGB: Math.round(avgGB * 100) / 100,
    peakGB: Math.round(peakGB * 100) / 100,
    gbHours: Math.round(totalGBHours * 100) / 100,
    snapshotCount: snapshots.length,
  };
}

/**
 * Get aggregated storage usage for a customer with plan quota context.
 * Returns both raw usage and billable usage (after quota deduction).
 */
export async function getStorageUsageSummary(prisma, tenantId, customerId, periodStart, periodEnd) {
  // Get GB-hours from snapshots
  const gbData = await calculateGBHours(prisma, tenantId, customerId, periodStart, periodEnd);

  // Get operation counts from usage events
  const opCodes = ['storage_put_ops', 'storage_get_ops', 'storage_delete_ops'];
  const operations = {};

  for (const code of opCodes) {
    const count = await prisma.usageEvent.count({
      where: {
        tenantId,
        customerId,
        eventCode: code,
        timestamp: { gte: periodStart, lte: periodEnd },
      },
    });
    operations[code] = count;
  }

  // Get bandwidth from usage events
  const bandwidthCodes = ['storage_egress_bytes', 'storage_ingress_bytes'];
  const bandwidth = {};

  for (const code of bandwidthCodes) {
    const events = await prisma.usageEvent.findMany({
      where: {
        tenantId,
        customerId,
        eventCode: code,
        timestamp: { gte: periodStart, lte: periodEnd },
      },
      select: { properties: true },
    });
    const totalBytes = events.reduce((sum, e) => {
      const props = JSON.parse(e.properties || '{}');
      return sum + (parseFloat(props.bytes) || 0);
    }, 0);
    bandwidth[code] = {
      totalBytes,
      totalGB: Math.round(totalBytes / (1024 * 1024 * 1024) * 1000) / 1000,
    };
  }

  // Get current real-time storage state
  const buckets = await prisma.storageBucket.findMany({
    where: { tenantId, customerId },
    select: { id: true, name: true, usedBytes: true, objectCount: true, quotaBytes: true },
  });
  const currentBytes = buckets.reduce((sum, b) => sum + Number(b.usedBytes), 0);
  const currentObjects = buckets.reduce((sum, b) => sum + b.objectCount, 0);

  // Check plan quota
  const activeSubscription = await prisma.subscription.findFirst({
    where: { tenantId, customerId, status: { in: ['ACTIVE', 'TRIAL'] } },
    include: {
      planVersion: {
        include: {
          priceComponents: { include: { billableMetric: true } },
        },
      },
    },
  });

  let planQuotaGB = null;
  let includedOps = null;
  // Real per-unit rates from the active plan's pricing model. On the current plans
  // (Free 500 MB / Pro 1 GB) storage is hard-capped with unitPrice 0 and ops are
  // included at pricePerThousand 0 — so these are 0. Surfacing them (instead of
  // hardcoding rates in the UI) keeps the frontend in lockstep with the real model.
  let storageUnitPrice = null;
  let putPricePerThousand = null;
  let getPricePerThousand = null;

  if (activeSubscription) {
    for (const pc of activeSubscription.planVersion.priceComponents) {
      const pricing = JSON.parse(pc.pricingModel || '{}');
      if (pc.billableMetric?.code === 'storage_bytes_stored') {
        if (pricing.includedGB) planQuotaGB = pricing.includedGB;
        if (pricing.unitPrice != null) storageUnitPrice = pricing.unitPrice;
      }
      if (pc.billableMetric?.code === 'storage_put_ops') {
        if (pricing.includedOps) includedOps = pricing.includedOps;
        if (pricing.pricePerThousand != null) putPricePerThousand = pricing.pricePerThousand;
      }
      if (pc.billableMetric?.code === 'storage_get_ops' && pricing.pricePerThousand != null) {
        getPricePerThousand = pricing.pricePerThousand;
      }
    }
  }

  return {
    storage: {
      avgGB: gbData.avgGB,
      peakGB: gbData.peakGB,
      gbHours: gbData.gbHours,
      currentBytes,
      currentGB: Math.round(currentBytes / (1024 * 1024 * 1024) * 1000) / 1000,
      currentObjects,
    },
    operations,
    bandwidth,
    buckets: buckets.map(b => ({
      id: b.id,
      name: b.name,
      usedBytes: Number(b.usedBytes),
      objectCount: b.objectCount,
      quotaBytes: b.quotaBytes ? Number(b.quotaBytes) : null,
    })),
    plan: planQuotaGB ? {
      quotaGB: planQuotaGB,
      usedGB: gbData.avgGB,
      remainingGB: Math.max(0, planQuotaGB - gbData.avgGB),
      overageGB: Math.max(0, gbData.avgGB - planQuotaGB),
      includedOps,
      storageUnitPrice: storageUnitPrice ?? 0,
      putPricePerThousand: putPricePerThousand ?? 0,
      getPricePerThousand: getPricePerThousand ?? 0,
    } : null,
    period: {
      start: periodStart.toISOString(),
      end: periodEnd.toISOString(),
    },
  };
}
