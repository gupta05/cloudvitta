/**
 * CloudVitta Metering Service
 * Equivalent to Meteroid's metering module
 *
 * Aggregates raw usage events into billable metric values.
 * Supports: COUNT, SUM, MAX, UNIQUE_COUNT, AVERAGE
 */

/**
 * Aggregate usage events for a customer + metric over a time period.
 * @returns {{ value: number, eventCount: number, metricCode: string }}
 */
export async function aggregateUsage(prisma, tenantId, customerId, metricCode, periodStart, periodEnd) {
  // Get the metric definition
  const metric = await prisma.billableMetric.findFirst({
    where: { tenantId, code: metricCode },
  });

  if (!metric) {
    return { value: 0, eventCount: 0, metricCode, error: 'Metric not found' };
  }

  // Fetch events for the period
  const events = await prisma.usageEvent.findMany({
    where: {
      tenantId,
      customerId,
      eventCode: metricCode,
      timestamp: {
        gte: periodStart,
        lte: periodEnd,
      },
    },
    orderBy: { timestamp: 'asc' },
  });

  const eventCount = events.length;

  if (eventCount === 0) {
    return { value: 0, eventCount: 0, metricCode };
  }

  let value = 0;

  switch (metric.aggregationType) {
    case 'COUNT': {
      value = eventCount;
      break;
    }

    case 'SUM': {
      value = events.reduce((sum, e) => {
        const props = JSON.parse(e.properties || '{}');
        const v = parseFloat(props[metric.aggregationKey]) || 0;
        return sum + v;
      }, 0);
      break;
    }

    case 'MAX': {
      value = events.reduce((max, e) => {
        const props = JSON.parse(e.properties || '{}');
        const v = parseFloat(props[metric.aggregationKey]) || 0;
        return Math.max(max, v);
      }, -Infinity);
      if (value === -Infinity) value = 0;
      break;
    }

    case 'UNIQUE_COUNT': {
      const uniqueValues = new Set();
      events.forEach((e) => {
        const props = JSON.parse(e.properties || '{}');
        const v = props[metric.aggregationKey];
        if (v !== undefined && v !== null) uniqueValues.add(String(v));
      });
      value = uniqueValues.size;
      break;
    }

    case 'AVERAGE': {
      const total = events.reduce((sum, e) => {
        const props = JSON.parse(e.properties || '{}');
        const v = parseFloat(props[metric.aggregationKey]) || 0;
        return sum + v;
      }, 0);
      value = eventCount > 0 ? total / eventCount : 0;
      break;
    }

    default:
      value = eventCount;
  }

  return {
    value: Math.round(value * 100) / 100, // round to 2 decimal places
    eventCount,
    metricCode,
    aggregationType: metric.aggregationType,
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
  };
}

/**
 * Aggregate storage-specific usage for billing.
 * Uses StorageSnapshot for GB-hour data instead of raw events.
 * Returns billable values after plan quota deduction.
 */
export async function aggregateStorageUsage(prisma, tenantId, customerId, metricCode, periodStart, periodEnd, planQuota = null) {
  // Storage bytes: use snapshot-based GB-hour calculation
  if (metricCode === 'storage_bytes_stored') {
    const snapshots = await prisma.storageSnapshot.findMany({
      where: {
        tenantId,
        customerId,
        bucketId: null,
        snapshotTime: { gte: periodStart, lte: periodEnd },
      },
      orderBy: { snapshotTime: 'asc' },
    });

    let avgGB = 0;
    let peakGB = 0;

    if (snapshots.length > 0) {
      let totalGBHours = 0;
      for (let i = 0; i < snapshots.length; i++) {
        const currentGB = Number(snapshots[i].usedBytes) / (1024 * 1024 * 1024);
        peakGB = Math.max(peakGB, currentGB);
        const nextTime = i + 1 < snapshots.length ? snapshots[i + 1].snapshotTime : periodEnd;
        const hours = (nextTime.getTime() - snapshots[i].snapshotTime.getTime()) / (1000 * 60 * 60);
        totalGBHours += currentGB * hours;
      }
      const totalHours = (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60);
      avgGB = totalHours > 0 ? totalGBHours / totalHours : 0;
    } else {
      // Fallback: current bucket state
      const buckets = await prisma.storageBucket.findMany({
        where: { tenantId, customerId },
        select: { usedBytes: true },
      });
      avgGB = buckets.reduce((sum, b) => sum + Number(b.usedBytes), 0) / (1024 * 1024 * 1024);
      peakGB = avgGB;
    }

    // Apply plan quota deduction
    let billableGB = avgGB;
    if (planQuota && planQuota.includedGB) {
      billableGB = Math.max(0, avgGB - planQuota.includedGB);
    }

    return {
      value: Math.round(billableGB * 100) / 100,
      rawValue: Math.round(avgGB * 100) / 100,
      peakValue: Math.round(peakGB * 100) / 100,
      eventCount: snapshots.length,
      metricCode,
      aggregationType: 'GB_HOURS_AVG',
      includedInPlan: planQuota?.includedGB || 0,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    };
  }

  // Bandwidth metrics: SUM of bytes from event properties
  if (metricCode === 'storage_egress_bytes' || metricCode === 'storage_ingress_bytes') {
    const events = await prisma.usageEvent.findMany({
      where: {
        tenantId, customerId, eventCode: metricCode,
        timestamp: { gte: periodStart, lte: periodEnd },
      },
    });

    const totalBytes = events.reduce((sum, e) => {
      const props = JSON.parse(e.properties || '{}');
      return sum + (parseFloat(props.bytes) || 0);
    }, 0);
    const totalGB = totalBytes / (1024 * 1024 * 1024);

    let billableGB = totalGB;
    if (planQuota && planQuota.includedEgressGB && metricCode === 'storage_egress_bytes') {
      billableGB = Math.max(0, totalGB - planQuota.includedEgressGB);
    }

    return {
      value: Math.round(billableGB * 1000) / 1000,
      rawValue: Math.round(totalGB * 1000) / 1000,
      eventCount: events.length,
      metricCode,
      aggregationType: 'SUM_BYTES_TO_GB',
      includedInPlan: planQuota?.includedEgressGB || 0,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    };
  }

  // Operations metrics: COUNT of events with optional plan quota
  if (['storage_put_ops', 'storage_get_ops', 'storage_delete_ops'].includes(metricCode)) {
    const count = await prisma.usageEvent.count({
      where: {
        tenantId, customerId, eventCode: metricCode,
        timestamp: { gte: periodStart, lte: periodEnd },
      },
    });

    let billableCount = count;
    if (planQuota && planQuota.includedOps) {
      billableCount = Math.max(0, count - planQuota.includedOps);
    }

    return {
      value: billableCount,
      rawValue: count,
      eventCount: count,
      metricCode,
      aggregationType: 'COUNT',
      includedInPlan: planQuota?.includedOps || 0,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
    };
  }

  // Fallback to standard aggregation for non-storage metrics
  return aggregateUsage(prisma, tenantId, customerId, metricCode, periodStart, periodEnd);
}

