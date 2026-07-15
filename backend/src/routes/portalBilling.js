/**
 * CloudVitta Portal Billing Routes
 * Plans browsing, subscription self-service, payment methods, charges, invoice download
 */

import { Router } from 'express';
import { authenticate, requireUser } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess } from '../middleware/tenantContext.js';
import { getStorageUsageSummary } from '../services/storageMeter.js';
import { computePlanChargeCents } from '../services/paymentService.js';
import { recordTransaction, TXN } from '../services/ledger.js';

const router = Router();
router.use(authenticate, tenantContext, validateTenantAccess, requireUser);

// ─── Available Plans ────────────────────────────────────────

// GET /api/portal/billing/plans — list all active plans with pricing
router.get('/plans', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;

    const plans = await prisma.plan.findMany({
      where: { status: 'ACTIVE' },
      include: {
        versions: {
          where: { isActive: true },
          include: {
            priceComponents: {
              include: { billableMetric: { select: { name: true, code: true } } },
            },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Get current subscription to mark the active plan
    const currentSub = await prisma.subscription.findFirst({
      where: {
        tenantId: req.tenantId,
        customerId: req.customerId,
        status: { in: ['ACTIVE', 'TRIAL'] },
      },
      select: { planVersionId: true, planVersion: { select: { planId: true } } },
    });

    const formattedPlans = plans.map((plan) => {
      const version = plan.versions[0]; // Active version
      if (!version) return null;

      // Bandwidth (egress/ingress) is internal-only — excluded from customer-facing plans.
      const bandwidthCodes = ['storage_egress_bytes', 'storage_ingress_bytes'];
      const customerComponents = version.priceComponents.filter(
        (comp) => !bandwidthCodes.includes(comp.billableMetric?.code)
      );

      // Parse pricing details
      let monthlyPrice = 0;
      let storageGB = 0;
      let includedOps = 0;
      const features = [];

      for (const comp of customerComponents) {
        const pricing = JSON.parse(comp.pricingModel || '{}');
        if (pricing.model === 'flat') monthlyPrice = pricing.price || 0;
        if (pricing.includedGB) storageGB = pricing.includedGB;
        else if (pricing.hardCapGB && !storageGB) storageGB = pricing.hardCapGB;
        if (pricing.includedOps) includedOps = pricing.includedOps;

        // Build feature list
        if (comp.name) features.push(comp.name);
      }

      return {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        planType: plan.planType,
        versionId: version.id,
        billingPeriod: version.billingPeriod,
        trialDays: version.trialDays,
        currency: version.currency,
        monthlyPrice,
        storageGB,
        includedOps,
        features,
        isCurrent: currentSub?.planVersion?.planId === plan.id,
        priceComponents: customerComponents.map((pc) => ({
          id: pc.id,
          name: pc.name,
          feeType: pc.feeType,
          pricingModel: JSON.parse(pc.pricingModel || '{}'),
          metric: pc.billableMetric,
        })),
      };
    }).filter(Boolean);

    res.json({ data: formattedPlans });
  } catch (err) { next(err); }
});

// ─── Subscription Management ────────────────────────────────

// POST /api/portal/billing/subscribe — subscribe to or change plan
router.post('/subscribe', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { planVersionId } = req.body;

    if (!planVersionId) {
      return res.status(400).json({ error: 'planVersionId is required' });
    }

    // Verify the plan version exists and is active
    const planVersion = await prisma.planVersion.findUnique({
      where: { id: planVersionId },
      include: {
        plan: true,
        priceComponents: true,
      },
    });

    if (!planVersion || !planVersion.isActive) {
      return res.status(404).json({ error: 'Plan not found or not available' });
    }

    // Paid plans must go through Razorpay checkout — a subscription is only
    // activated after backend payment verification. This endpoint only handles
    // free plans.
    if (computePlanChargeCents(planVersion) > 0) {
      return res.status(402).json({
        error: 'This plan requires payment. Use the payment checkout flow.',
        requiresPayment: true,
      });
    }

    // Check for existing active subscription
    const existingSub = await prisma.subscription.findFirst({
      where: {
        tenantId: req.tenantId,
        customerId: req.customerId,
        status: { in: ['ACTIVE', 'TRIAL', 'PENDING'] },
      },
    });

    let subscription;

    if (existingSub) {
      // Upgrade/downgrade: cancel old, create new
      await prisma.subscription.update({
        where: { id: existingSub.id },
        data: {
          status: 'ENDED',
          cancelledAt: new Date(),
          cancelReason: 'Plan changed by customer',
        },
      });

      subscription = await prisma.subscription.create({
        data: {
          tenantId: req.tenantId,
          customerId: req.customerId,
          planVersionId,
          status: planVersion.trialDays > 0 ? 'TRIAL' : 'ACTIVE',
          billingStartDate: new Date(),
          billingDay: new Date().getDate(),
          trialStartDate: planVersion.trialDays > 0 ? new Date() : null,
          trialEndDate: planVersion.trialDays > 0
            ? new Date(Date.now() + planVersion.trialDays * 86400000) : null,
        },
      });
    } else {
      // New subscription
      subscription = await prisma.subscription.create({
        data: {
          tenantId: req.tenantId,
          customerId: req.customerId,
          planVersionId,
          status: planVersion.trialDays > 0 ? 'TRIAL' : 'ACTIVE',
          billingStartDate: new Date(),
          billingDay: new Date().getDate(),
          trialStartDate: planVersion.trialDays > 0 ? new Date() : null,
          trialEndDate: planVersion.trialDays > 0
            ? new Date(Date.now() + planVersion.trialDays * 86400000) : null,
        },
      });
    }

    // Create subscription components
    if (planVersion.priceComponents.length > 0) {
      await prisma.subscriptionComponent.createMany({
        data: planVersion.priceComponents.map((pc) => ({
          subscriptionId: subscription.id,
          priceComponentId: pc.id,
        })),
      });
    }

    // Create notification
    prisma.notification.create({
      data: {
        userId: req.user.userId,
        type: 'billing',
        title: existingSub ? 'Plan changed' : 'Subscription activated',
        message: `You are now subscribed to the ${planVersion.plan.name} plan.`,
      },
    }).catch(() => {});

    recordTransaction(prisma, {
      tenantId: req.tenantId,
      customerId: req.customerId,
      type: TXN.SUBSCRIPTION_ACTIVATED,
      description: `${planVersion.plan.name} plan activated (free plan self-service)`,
      subscriptionId: subscription.id,
      idempotencyKey: `${subscription.id}:SUBSCRIPTION_ACTIVATED`,
    }).catch(() => {});

    // Return full subscription details
    const fullSub = await prisma.subscription.findUnique({
      where: { id: subscription.id },
      include: {
        planVersion: {
          include: {
            plan: { select: { id: true, name: true, planType: true, description: true } },
            priceComponents: true,
          },
        },
      },
    });

    res.json({ subscription: fullSub });
  } catch (err) { next(err); }
});

// POST /api/portal/billing/cancel — cancel subscription
router.post('/cancel', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { reason } = req.body;

    const subscription = await prisma.subscription.findFirst({
      where: {
        tenantId: req.tenantId,
        customerId: req.customerId,
        status: { in: ['ACTIVE', 'TRIAL'] },
      },
      include: { planVersion: { include: { plan: true } } },
    });

    if (!subscription) {
      return res.status(404).json({ error: 'No active subscription found' });
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: reason || 'Cancelled by customer',
      },
    });

    // Create notification
    prisma.notification.create({
      data: {
        userId: req.user.userId,
        type: 'billing',
        title: 'Subscription cancelled',
        message: `Your ${subscription.planVersion.plan.name} subscription has been cancelled.`,
      },
    }).catch(() => {});

    recordTransaction(prisma, {
      tenantId: req.tenantId,
      customerId: req.customerId,
      type: TXN.SUBSCRIPTION_CANCELLED,
      description: `${subscription.planVersion.plan.name} plan cancelled by customer${reason ? `: ${reason}` : ''}`,
      subscriptionId: subscription.id,
      idempotencyKey: `${subscription.id}:SUBSCRIPTION_CANCELLED`,
    }).catch(() => {});

    res.json({ message: 'Subscription cancelled' });
  } catch (err) { next(err); }
});

// ─── Payment Methods ────────────────────────────────────────

// GET /api/portal/billing/payment-methods
router.get('/payment-methods', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const methods = await prisma.paymentMethod.findMany({
      where: { customerId: req.customerId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ data: methods });
  } catch (err) { next(err); }
});

// POST /api/portal/billing/payment-methods — add simulated payment method
router.post('/payment-methods', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { type, brand, last4, expMonth, expYear } = req.body;

    if (!last4 || last4.length !== 4) {
      return res.status(400).json({ error: 'last4 must be exactly 4 digits' });
    }

    const validBrands = ['visa', 'mastercard', 'amex', 'discover'];
    if (brand && !validBrands.includes(brand.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid card brand' });
    }

    // If this is the first method, make it default
    const existingCount = await prisma.paymentMethod.count({
      where: { customerId: req.customerId },
    });

    const method = await prisma.paymentMethod.create({
      data: {
        customerId: req.customerId,
        tenantId: req.tenantId,
        type: type || 'card',
        brand: (brand || 'visa').toLowerCase(),
        last4,
        expMonth: expMonth || null,
        expYear: expYear || null,
        isDefault: existingCount === 0,
      },
    });

    res.status(201).json(method);
  } catch (err) { next(err); }
});

// DELETE /api/portal/billing/payment-methods/:id
router.delete('/payment-methods/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const method = await prisma.paymentMethod.findFirst({
      where: { id: req.params.id, customerId: req.customerId },
    });

    if (!method) return res.status(404).json({ error: 'Payment method not found' });

    await prisma.paymentMethod.delete({ where: { id: req.params.id } });

    // If deleted was default, make the next one default
    if (method.isDefault) {
      const next = await prisma.paymentMethod.findFirst({
        where: { customerId: req.customerId },
        orderBy: { createdAt: 'desc' },
      });
      if (next) {
        await prisma.paymentMethod.update({
          where: { id: next.id },
          data: { isDefault: true },
        });
      }
    }

    res.status(204).send();
  } catch (err) { next(err); }
});

// PUT /api/portal/billing/payment-methods/:id/default
router.put('/payment-methods/:id/default', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const method = await prisma.paymentMethod.findFirst({
      where: { id: req.params.id, customerId: req.customerId },
    });

    if (!method) return res.status(404).json({ error: 'Payment method not found' });

    // Unset all defaults first
    await prisma.paymentMethod.updateMany({
      where: { customerId: req.customerId },
      data: { isDefault: false },
    });

    // Set the new default
    const updated = await prisma.paymentMethod.update({
      where: { id: req.params.id },
      data: { isDefault: true },
    });

    res.json(updated);
  } catch (err) { next(err); }
});

// ─── Current Charges ────────────────────────────────────────

// GET /api/portal/billing/charges — current period cost breakdown
router.get('/charges', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { tenantId, customerId } = req;

    // Get subscription
    const subscription = await prisma.subscription.findFirst({
      where: { tenantId, customerId, status: { in: ['ACTIVE', 'TRIAL'] } },
      include: {
        planVersion: {
          include: {
            plan: true,
            priceComponents: {
              include: { billableMetric: true },
            },
          },
        },
      },
    });

    if (!subscription) {
      return res.json({ charges: [], total: 0, subscription: null });
    }

    // Get usage
    const periodStart = subscription.billingStartDate;
    const periodEnd = new Date();
    const usage = await getStorageUsageSummary(prisma, tenantId, customerId, periodStart, periodEnd);

    // Calculate charges per component. Bandwidth (egress/ingress) is internal-only and
    // never billed to customers, so it is excluded from the charge breakdown.
    const bandwidthCodes = ['storage_egress_bytes', 'storage_ingress_bytes'];
    const charges = [];
    let total = 0;

    for (const comp of subscription.planVersion.priceComponents) {
      if (bandwidthCodes.includes(comp.billableMetric?.code)) continue;

      const pricing = JSON.parse(comp.pricingModel || '{}');
      let amount = 0;
      let description = comp.name;

      if (pricing.model === 'flat') {
        amount = pricing.price || 0;
        description = `${comp.name} — Base fee`;
      } else if (pricing.model === 'per_unit') {
        // Match the invoice engine: bill the time-weighted average GB above the included quota.
        const usedGB = usage?.storage?.avgGB || 0;
        const includedGB = pricing.includedGB || 0;
        const unitPrice = pricing.unitPrice || 0;
        const overageGB = Math.max(0, usedGB - includedGB);
        amount = overageGB * unitPrice;
        description = `${comp.name} — ${overageGB.toFixed(2)} GB overage @ ₹${unitPrice}/GB`;
      } else if (pricing.model === 'tiered') {
        // Simplified tiered calculation
        amount = 0;
        description = `${comp.name} — Usage-based`;
      }

      charges.push({
        component: comp.name,
        description,
        amount: Math.round(amount * 100) / 100,
        metric: comp.billableMetric?.name || null,
      });
      total += amount;
    }

    res.json({
      charges,
      total: Math.round(total * 100) / 100,
      currency: subscription.planVersion.currency,
      periodStart: subscription.billingStartDate,
      periodEnd: new Date(),
      planName: subscription.planVersion.plan.name,
    });
  } catch (err) { next(err); }
});

// ─── Invoice Download ───────────────────────────────────────

// GET /api/portal/billing/invoices/:id/download — generate downloadable invoice data
router.get('/invoices/:id/download', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId, customerId: req.customerId },
      include: {
        customer: true,
        subscription: { include: { planVersion: { include: { plan: true } } } },
        lines: { orderBy: { createdAt: 'asc' } },
        creditNotes: true,
      },
    });

    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    // Get invoicing entity for company details
    const entity = await prisma.invoicingEntity.findUnique({
      where: { tenantId: req.tenantId },
    });

    res.json({
      invoice: {
        ...invoice,
        totalCents: invoice.totalCents,
        subtotalCents: invoice.subtotalCents,
        taxCents: invoice.taxCents,
      },
      company: entity || { legalName: 'CloudVitta Inc.' },
    });
  } catch (err) { next(err); }
});

export default router;
