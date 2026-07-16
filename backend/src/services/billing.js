/**
 * CloudVitta Billing Engine
 * Equivalent to Meteroid's invoice_rendering.rs (29KB of billing logic)
 *
 * Generates invoices from subscriptions by:
 * 1. Iterating over price components
 * 2. Calculating charges based on pricing model (flat, per_unit, tiered, usage-based)
 * 3. Applying coupons/discounts
 * 4. Creating invoice with line items
 */

import { aggregateUsage, aggregateStorageUsage } from './metering.js';
import { recordTransaction, TXN } from './ledger.js';

/**
 * Preview the charges for a subscription over a period WITHOUT writing anything.
 * This is the single calculation path shared by invoice generation and the
 * portal's live charge estimate — keeping estimate ≡ invoice by construction.
 *
 * Returns { sub, lines, subtotalCents, discountCents, totalCents, taxCents, periodStart, periodEnd }.
 */
export async function previewCharges(prisma, subscriptionId, tenantId, periodStart, periodEnd) {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      customer: true,
      planVersion: {
        include: {
          plan: true,
          priceComponents: { include: { billableMetric: true } },
        },
      },
      components: true,
      addons: { include: { addon: true } },
      coupon: true,
    },
  });

  if (!sub) throw new Error('Subscription not found');
  if (!['ACTIVE', 'TRIAL'].includes(sub.status)) {
    throw new Error(`Cannot calculate charges for subscription in ${sub.status} status`);
  }

  // Calculate billing period
  const now = new Date();
  const start = periodStart || getBillingPeriodStart(sub, now);
  const end = periodEnd || getBillingPeriodEnd(sub, start);

  // Generate line items from price components.
  // Bandwidth (egress/ingress) is tracked internally only and is never billed to customers.
  const bandwidthCodes = ['storage_egress_bytes', 'storage_ingress_bytes'];
  const lines = [];

  for (const pc of sub.planVersion.priceComponents) {
    if (bandwidthCodes.includes(pc.billableMetric?.code)) continue;
    const pricing = JSON.parse(pc.pricingModel || '{}');
    const lineItems = await calculatePriceComponent(prisma, pc, pricing, sub, tenantId, start, end);
    lines.push(...lineItems);
  }

  // Add addon charges
  for (const subAddon of sub.addons) {
    const addon = subAddon.addon;
    const totalCents = addon.priceCents * subAddon.quantity;
    lines.push({
      name: `Add-on: ${addon.name}`,
      description: `${subAddon.quantity}x ${addon.name}`,
      quantity: subAddon.quantity,
      unitPriceCents: addon.priceCents,
      totalCents,
      metadata: JSON.stringify({ addonId: addon.id, type: 'addon' }),
    });
  }

  // Calculate subtotal
  const subtotalCents = lines.reduce((sum, line) => sum + line.totalCents, 0);

  // Apply coupon discount
  let discountCents = 0;
  if (sub.coupon && sub.coupon.isActive) {
    if (sub.coupon.discountType === 'PERCENTAGE') {
      discountCents = Math.round(subtotalCents * (sub.coupon.discountValue / 100));
    } else if (sub.coupon.discountType === 'FIXED_AMOUNT') {
      discountCents = Math.round(sub.coupon.discountValue);
    }
    if (discountCents > 0) {
      lines.push({
        name: `Discount: ${sub.coupon.code}`,
        description: sub.coupon.discountType === 'PERCENTAGE'
          ? `${sub.coupon.discountValue}% off`
          : `₹${(sub.coupon.discountValue / 100).toFixed(2)} off`,
        quantity: 1,
        unitPriceCents: -discountCents,
        totalCents: -discountCents,
        metadata: JSON.stringify({ couponId: sub.coupon.id, type: 'discount' }),
      });
    }
  }

  const totalCents = Math.max(0, subtotalCents - discountCents);
  const taxCents = 0; // Tax calculation can be added later

  return { sub, lines, subtotalCents, discountCents, totalCents, taxCents, periodStart: start, periodEnd: end };
}

/**
 * Generate an invoice for a subscription.
 * @param {PrismaClient} prisma
 * @param {string} subscriptionId
 * @param {string} tenantId
 * @param {Date} periodStart - defaults to start of current billing period
 * @param {Date} periodEnd - defaults to end of current billing period
 */
export async function generateInvoiceForSubscription(prisma, subscriptionId, tenantId, periodStart, periodEnd) {
  const { sub, lines, subtotalCents, totalCents, taxCents, periodStart: start, periodEnd: end } =
    await previewCharges(prisma, subscriptionId, tenantId, periodStart, periodEnd);

  // Calculate due date
  const now = new Date();
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + sub.netTermsDays);

  // Create invoice with lines in a transaction
  // Invoice number is generated inside the transaction to prevent race-condition duplicates.
  const invoice = await prisma.$transaction(async (tx) => {
    // Find highest existing invoice number for this tenant and increment
    const lastInvoice = await tx.invoice.findFirst({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      select: { invoiceNumber: true },
    });
    let nextNum = 1;
    if (lastInvoice?.invoiceNumber) {
      const match = lastInvoice.invoiceNumber.match(/INV-(\d+)/);
      if (match) nextNum = parseInt(match[1], 10) + 1;
    }
    const invoiceNumber = `INV-${String(nextNum).padStart(5, '0')}`;

    const inv = await tx.invoice.create({
      data: {
        tenantId,
        customerId: sub.customerId,
        subscriptionId: sub.id,
        invoiceNumber,
        status: 'DRAFT',
        currency: sub.planVersion.currency,
        subtotalCents,
        taxCents,
        totalCents,
        amountDueCents: totalCents,
        periodStart: start,
        periodEnd: end,
        dueDate,
      },
    });

    if (lines.length > 0) {
      await tx.invoiceLine.createMany({
        data: lines.map((l) => ({ invoiceId: inv.id, ...l })),
      });
    }

    return tx.invoice.findUnique({
      where: { id: inv.id },
      include: { lines: true, customer: true },
    });
  });

  recordTransaction(prisma, {
    tenantId,
    customerId: sub.customerId,
    type: TXN.INVOICE_GENERATED,
    amountCents: invoice.totalCents,
    currency: invoice.currency,
    description: `Invoice ${invoice.invoiceNumber} generated (${sub.planVersion.plan.name} plan)`,
    invoiceId: invoice.id,
    subscriptionId: sub.id,
    idempotencyKey: `${invoice.id}:GENERATED`,
  }).catch((err) => console.error('[Billing] Ledger write failed:', err.message));

  return invoice;
}

/**
 * Calculate charges for a single price component.
 */
async function calculatePriceComponent(prisma, priceComponent, pricing, subscription, tenantId, periodStart, periodEnd) {
  const lines = [];
  const model = pricing.model || 'flat';

  // Determine if this is a storage metric (use storage-specific aggregation)
  const isStorageMetric = priceComponent.billableMetric &&
    ['storage_bytes_stored', 'storage_put_ops', 'storage_get_ops', 'storage_delete_ops', 'storage_egress_bytes', 'storage_ingress_bytes']
      .includes(priceComponent.billableMetric.code);

  // Build plan quota context for storage metrics
  const planQuota = isStorageMetric ? {
    includedGB: pricing.includedGB || 0,
    includedOps: pricing.includedOps || 0,
    includedEgressGB: pricing.includedEgressGB || 0,
  } : null;

  // Helper: get usage (storage-aware or standard)
  async function getUsage(metricCode) {
    if (isStorageMetric) {
      return aggregateStorageUsage(prisma, tenantId, subscription.customerId, metricCode, periodStart, periodEnd, planQuota);
    }
    return aggregateUsage(prisma, tenantId, subscription.customerId, metricCode, periodStart, periodEnd);
  }

  switch (model) {
    case 'flat': {
      const price = pricing.price || 0;
      lines.push({
        name: priceComponent.name,
        description: `Flat fee — ${subscription.planVersion.billingPeriod.toLowerCase()}`,
        quantity: 1,
        unitPriceCents: Math.round(price * 100),
        totalCents: Math.round(price * 100),
        metadata: JSON.stringify({ priceComponentId: priceComponent.id, model: 'flat' }),
      });
      break;
    }

    case 'per_unit': {
      const unitPrice = pricing.unitPrice || 0;
      // For usage-based per-unit, get usage from metering
      let quantity = pricing.quantity || 1;
      let usage = null;
      if (priceComponent.billableMetric) {
        usage = await getUsage(priceComponent.billableMetric.code);
        quantity = usage.value;

        // For storage metrics, add an info line showing total usage vs included
        if (isStorageMetric && usage.rawValue !== undefined && usage.rawValue !== usage.value) {
          lines.push({
            name: `${priceComponent.name} (Included)`,
            description: `${usage.rawValue} total, ${usage.includedInPlan} included in plan`,
            quantity: Math.min(usage.rawValue, usage.includedInPlan),
            unitPriceCents: 0,
            totalCents: 0,
            metadata: JSON.stringify({
              priceComponentId: priceComponent.id, model: 'per_unit',
              type: 'included_quota', metricCode: priceComponent.billableMetric.code,
            }),
          });
        }
      }
      const totalCents = Math.round(unitPrice * 100 * quantity);
      // A storage line is "Overage" when raw usage exceeds the plan's included allowance.
      const isOverage = isStorageMetric && usage && usage.rawValue > (usage.includedInPlan || 0);
      lines.push({
        name: isOverage ? `${priceComponent.name} (Overage)` : priceComponent.name,
        description: `${quantity} × ₹${unitPrice}`,
        quantity,
        unitPriceCents: Math.round(unitPrice * 100),
        totalCents,
        metadata: JSON.stringify({
          priceComponentId: priceComponent.id, model: 'per_unit',
          metricCode: priceComponent.billableMetric?.code,
        }),
      });
      break;
    }

    case 'metered_gb_month': {
      // Pay-as-you-go storage: bill the time-weighted average GB stored over the
      // period (GB-hours / period-hours) at ₹pricePerGBMonth per GB-month.
      // Usage is defensively capped at hardCapGB — uploads are already blocked at
      // the cap in real time, so avg can never legitimately exceed it.
      const pricePerGBMonth = pricing.pricePerGBMonth || 0;
      if (!priceComponent.billableMetric) break;

      const usage = await getUsage(priceComponent.billableMetric.code);
      const measuredGB = usage.preciseAvgGB ?? usage.rawValue ?? usage.value; // full average, no quota deduction
      const billedGB = Math.min(measuredGB, pricing.hardCapGB || Infinity);
      const totalCents = Math.round(billedGB * pricePerGBMonth * 100);

      lines.push({
        name: `Metered Storage — ${billedGB.toFixed(3)} GB avg`,
        description: `${billedGB.toFixed(3)} GB avg × ₹${pricePerGBMonth}/GB-month (time-weighted${pricing.hardCapGB ? `, capped at ${pricing.hardCapGB} GB` : ''})`,
        quantity: billedGB,
        unitPriceCents: Math.round(pricePerGBMonth * 100),
        totalCents,
        metadata: JSON.stringify({
          priceComponentId: priceComponent.id, model: 'metered_gb_month',
          metricCode: priceComponent.billableMetric.code,
          avgGB: measuredGB, billedGB,
          gbHours: usage.gbHours ?? null, peakGB: usage.peakValue ?? null,
          snapshotCount: usage.snapshotCount ?? null,
          pricePerGBMonth, hardCapGB: pricing.hardCapGB ?? null,
        }),
      });
      break;
    }

    case 'tiered': {
      const tiers = pricing.tiers || [];
      if (!priceComponent.billableMetric) break;

      const usage = await getUsage(priceComponent.billableMetric.code);
      let remaining = usage.value;
      let prevLimit = 0;

      // For storage metrics with included quota, show included portion
      if (isStorageMetric && usage.rawValue !== undefined && usage.rawValue !== usage.value) {
        lines.push({
          name: `${priceComponent.name} (Included in plan)`,
          description: `${usage.includedInPlan} included`,
          quantity: Math.min(usage.rawValue, usage.includedInPlan),
          unitPriceCents: 0,
          totalCents: 0,
          metadata: JSON.stringify({ priceComponentId: priceComponent.id, type: 'included_quota' }),
        });
      }

      for (const tier of tiers) {
        if (remaining <= 0) break;
        const tierLimit = tier.upTo === null ? Infinity : tier.upTo;
        const tierRange = tierLimit - prevLimit;
        const qty = Math.min(remaining, tierRange);
        const unitPrice = tier.unitPrice || 0;
        const totalCents = Math.round(unitPrice * 100 * qty);

        lines.push({
          name: `${priceComponent.name} (Tier ${prevLimit + 1}–${tierLimit === Infinity ? '∞' : tierLimit})`,
          description: `${qty} units × ₹${unitPrice}`,
          quantity: qty,
          unitPriceCents: Math.round(unitPrice * 100),
          totalCents,
          metadata: JSON.stringify({
            priceComponentId: priceComponent.id, model: 'tiered',
            tierFrom: prevLimit, tierTo: tierLimit === Infinity ? null : tierLimit,
          }),
        });

        remaining -= qty;
        prevLimit = tierLimit;
      }
      break;
    }

    case 'per_thousand': {
      // Special model for API operations billing (per 1,000 requests)
      const pricePerThousand = pricing.pricePerThousand || 0;
      let count = 0;

      if (priceComponent.billableMetric) {
        const usage = await getUsage(priceComponent.billableMetric.code);
        count = usage.value;
      }

      const thousands = count / 1000;
      const totalCents = Math.round(pricePerThousand * 100 * thousands);

      lines.push({
        name: priceComponent.name,
        description: `${count.toLocaleString()} ops (${thousands.toFixed(1)}K × ₹${pricePerThousand}/1K)`,
        quantity: thousands,
        unitPriceCents: Math.round(pricePerThousand * 100),
        totalCents,
        metadata: JSON.stringify({
          priceComponentId: priceComponent.id, model: 'per_thousand',
          metricCode: priceComponent.billableMetric?.code, rawCount: count,
        }),
      });
      break;
    }

    case 'package': {
      const packageSize = pricing.packageSize || 1;
      const packagePrice = pricing.packagePrice || 0;
      let quantity = 1;

      if (priceComponent.billableMetric) {
        const usage = await getUsage(priceComponent.billableMetric.code);
        quantity = Math.ceil(usage.value / packageSize);
      }

      const totalCents = Math.round(packagePrice * 100 * quantity);
      lines.push({
        name: priceComponent.name,
        description: `${quantity} × package of ${packageSize} @ ₹${packagePrice}`,
        quantity,
        unitPriceCents: Math.round(packagePrice * 100),
        totalCents,
        metadata: JSON.stringify({ priceComponentId: priceComponent.id, model: 'package' }),
      });
      break;
    }

    default:
      // Unknown model, add as zero
      lines.push({
        name: priceComponent.name,
        description: `Unknown pricing model: ${model}`,
        quantity: 1,
        unitPriceCents: 0,
        totalCents: 0,
        metadata: JSON.stringify({ priceComponentId: priceComponent.id, model }),
      });
  }

  return lines;
}

/**
 * Get the start of the current billing period.
 */
function getBillingPeriodStart(subscription, referenceDate) {
  const now = referenceDate || new Date();
  const billingDay = subscription.billingDay || 1;
  const start = new Date(now.getFullYear(), now.getMonth(), billingDay);
  if (start > now) {
    start.setMonth(start.getMonth() - 1);
  }
  return start;
}

/**
 * Get the end of the current billing period based on billing period type.
 */
function getBillingPeriodEnd(subscription, periodStart) {
  const end = new Date(periodStart);
  const period = subscription.planVersion?.billingPeriod || 'MONTHLY';
  switch (period) {
    case 'MONTHLY': end.setMonth(end.getMonth() + 1); break;
    case 'QUARTERLY': end.setMonth(end.getMonth() + 3); break;
    case 'ANNUAL': end.setFullYear(end.getFullYear() + 1); break;
  }
  end.setDate(end.getDate() - 1);
  end.setHours(23, 59, 59, 999);
  return end;
}
