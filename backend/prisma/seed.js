/**
 * CloudVitta Seed Script
 * Creates demo data for a multi-tenant object storage service
 * with automatic metering and usage-based billing.
 * 
 * Plans:
 *   - Free: 500 MB storage, ₹0/mo (hard cap)
 *   - Pro: 1 GB storage, ₹200/mo (hard cap)
 *
 * Global platform cap: 15 GB (all users combined)
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seed() {
  console.log('🌱 Seeding CloudVitta database...');
  console.log('ℹ️  Non-destructive mode: real user accounts will NOT be deleted.\n');

  // ─── Safe Cleanup: Only wipe catalog & billing data ─────────────────────
  // Real user accounts, customers, sessions, and notifications are preserved.
  // Only demo/catalog data (plans, metrics, subscriptions, invoices, usage
  // events, snapshots, buckets, objects) is reset so the seed is safe to re-run.
  await prisma.$transaction([
    prisma.pendingRegistration.deleteMany(),
    prisma.storageSnapshot.deleteMany(),
    prisma.storageObject.deleteMany(),
    prisma.storageBucket.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.paymentWebhookEvent.deleteMany(),
    prisma.invoiceLine.deleteMany(),
    prisma.creditNote.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.usageEvent.deleteMany(),
    prisma.subscriptionAddon.deleteMany(),
    prisma.subscriptionComponent.deleteMany(),
    prisma.subscription.deleteMany(),
    prisma.priceComponent.deleteMany(),
    prisma.planVersion.deleteMany(),
    prisma.plan.deleteMany(),
    prisma.billableMetric.deleteMany(),
    prisma.product.deleteMany(),
    prisma.productFamily.deleteMany(),
    prisma.addon.deleteMany(),
    prisma.coupon.deleteMany(),
    prisma.apiToken.deleteMany(),
    prisma.webhookEndpoint.deleteMany(),
    prisma.invoicingEntity.deleteMany(),
  ]);
  console.log('✓ Catalog & billing data cleared (users preserved)');

  // ─── Organization & Tenants (upsert — safe to re-run) ───────────────────
  const org = await prisma.organization.upsert({
    where: { slug: 'cloudvitta-demo' },
    update: {},
    create: { name: 'CloudVitta Demo', slug: 'cloudvitta-demo' },
  });

  const prodTenant = await prisma.tenant.upsert({
    where: { slug_organizationId: { slug: 'production', organizationId: org.id } },
    update: { currency: 'INR' },
    create: { name: 'Production', slug: 'production', organizationId: org.id, currency: 'INR' },
  });

  const sandboxTenant = await prisma.tenant.upsert({
    where: { slug_organizationId: { slug: 'sandbox', organizationId: org.id } },
    update: { currency: 'INR' },
    create: { name: 'Sandbox', slug: 'sandbox', organizationId: org.id, currency: 'INR' },
  });

  // ─── Demo Staff Accounts (upsert — never overwrites real users) ──────────
  const passwordHash = await bcrypt.hash('password123', 12);
  await prisma.user.upsert({
    where: { email: 'admin@cloudvitta.dev' },
    update: {},
    create: { email: 'admin@cloudvitta.dev', passwordHash, displayName: 'Admin User', role: 'admin', organizationId: org.id, tenantId: prodTenant.id, isVerified: true },
  });
  await prisma.user.upsert({
    where: { email: 'member@cloudvitta.dev' },
    update: {},
    create: { email: 'member@cloudvitta.dev', passwordHash, displayName: 'Team Member', role: 'member', organizationId: org.id, tenantId: prodTenant.id, isVerified: true },
  });

  const t = prodTenant.id; // shorthand

  // ─── Product Catalog ───────────────────────────────────
  const storageFamily = await prisma.productFamily.create({ data: { tenantId: t, name: 'Object Storage' } });

  await prisma.product.create({
    data: { tenantId: t, productFamilyId: storageFamily.id, name: 'Cloud Object Storage', description: 'S3-compatible multi-tenant object storage' },
  });

  // ─── Storage Billable Metrics ──────────────────────────
  const storageMetric = await prisma.billableMetric.create({
    data: { tenantId: t, name: 'Storage Used (GB)', code: 'storage_bytes_stored', aggregationType: 'MAX', aggregationKey: 'gb_used', description: 'Average GB stored per billing period (GB-hours)' },
  });
  const putOpsMetric = await prisma.billableMetric.create({
    data: { tenantId: t, name: 'PUT Operations', code: 'storage_put_ops', aggregationType: 'COUNT', description: 'Number of PUT/POST/COPY object operations' },
  });
  const getOpsMetric = await prisma.billableMetric.create({
    data: { tenantId: t, name: 'GET Operations', code: 'storage_get_ops', aggregationType: 'COUNT', description: 'Number of GET/HEAD/LIST object operations' },
  });
  const deleteOpsMetric = await prisma.billableMetric.create({
    data: { tenantId: t, name: 'DELETE Operations', code: 'storage_delete_ops', aggregationType: 'COUNT', description: 'Number of DELETE operations' },
  });
  const egressMetric = await prisma.billableMetric.create({
    data: { tenantId: t, name: 'Egress Bandwidth (GB)', code: 'storage_egress_bytes', aggregationType: 'SUM', aggregationKey: 'bytes', description: 'Data downloaded from storage (egress)' },
  });
  const ingressMetric = await prisma.billableMetric.create({
    data: { tenantId: t, name: 'Ingress Bandwidth (GB)', code: 'storage_ingress_bytes', aggregationType: 'SUM', aggregationKey: 'bytes', description: 'Data uploaded to storage (ingress)' },
  });

  // ─── Storage Plans (only 2) ────────────────────────────

  // FREE: 500 MB storage, hard cap, ₹0/mo
  // 500 MB = 500/1024 GB under the app's GB×1024³ byte convention = exactly 524,288,000 bytes.
  const FREE_STORAGE_GB = 500 / 1024;
  const freePlan = await prisma.plan.create({
    data: { tenantId: t, productFamilyId: storageFamily.id, name: 'Free', planType: 'FREE', status: 'ACTIVE', description: 'Get started — 500 MB free forever, no credit card required' },
  });
  const freeVersion = await prisma.planVersion.create({
    data: { planId: freePlan.id, version: 1, billingPeriod: 'MONTHLY', trialDays: 0, isActive: true, currency: 'INR' },
  });
  await prisma.priceComponent.createMany({
    data: [
      { planVersionId: freeVersion.id, name: 'Base Fee', feeType: 'RECURRING', pricingModel: JSON.stringify({ model: 'flat', price: 0 }) },
      { planVersionId: freeVersion.id, name: 'Storage (500 MB included)', feeType: 'USAGE', billableMetricId: storageMetric.id, pricingModel: JSON.stringify({ model: 'per_unit', unitPrice: 0, includedGB: FREE_STORAGE_GB, hardCapGB: FREE_STORAGE_GB }) },
      { planVersionId: freeVersion.id, name: 'PUT/POST Operations', feeType: 'USAGE', billableMetricId: putOpsMetric.id, pricingModel: JSON.stringify({ model: 'per_thousand', pricePerThousand: 0, includedOps: 1000 }) },
      { planVersionId: freeVersion.id, name: 'GET/HEAD Operations', feeType: 'USAGE', billableMetricId: getOpsMetric.id, pricingModel: JSON.stringify({ model: 'per_thousand', pricePerThousand: 0, includedOps: 10000 }) },
      // Egress is tracked internally (metric + events below) but NOT a billable plan component.
    ],
  });

  // PRO: 1 GB storage, hard cap, ₹200/mo
  const proPlan = await prisma.plan.create({
    data: { tenantId: t, productFamilyId: storageFamily.id, name: 'Pro', planType: 'STANDARD', status: 'ACTIVE', description: 'For individuals — 1 GB storage, ₹200/month' },
  });
  const proVersion = await prisma.planVersion.create({
    data: { planId: proPlan.id, version: 1, billingPeriod: 'MONTHLY', trialDays: 7, isActive: true, currency: 'INR' },
  });
  await prisma.priceComponent.createMany({
    data: [
      { planVersionId: proVersion.id, name: 'Monthly Fee', feeType: 'RECURRING', pricingModel: JSON.stringify({ model: 'flat', price: 200 }) },
      { planVersionId: proVersion.id, name: 'Storage (1 GB included)', feeType: 'USAGE', billableMetricId: storageMetric.id, pricingModel: JSON.stringify({ model: 'per_unit', unitPrice: 0, includedGB: 1, hardCapGB: 1 }) },
      { planVersionId: proVersion.id, name: 'PUT/POST Operations', feeType: 'USAGE', billableMetricId: putOpsMetric.id, pricingModel: JSON.stringify({ model: 'per_thousand', pricePerThousand: 0, includedOps: 5000 }) },
      { planVersionId: proVersion.id, name: 'GET/HEAD Operations', feeType: 'USAGE', billableMetricId: getOpsMetric.id, pricingModel: JSON.stringify({ model: 'per_thousand', pricePerThousand: 0, includedOps: 50000 }) },
      // Egress is tracked internally (metric + events below) but NOT a billable plan component.
    ],
  });

  // ─── Demo Customers (upsert — safe to re-run) ──────────────────────────
  const acmeCustomer = await prisma.customer.upsert({
    where: { tenantId_alias: { tenantId: t, alias: 'acme' } },
    update: { currency: 'INR' },
    create: { tenantId: t, name: 'Acme Corp', alias: 'acme', email: 'billing@acme.com', currency: 'INR' },
  });
  const techstartCustomer = await prisma.customer.upsert({
    where: { tenantId_alias: { tenantId: t, alias: 'techstart' } },
    update: { currency: 'INR' },
    create: { tenantId: t, name: 'TechStart Inc', alias: 'techstart', email: 'finance@techstart.io', currency: 'INR' },
  });
  const dataflowCustomer = await prisma.customer.upsert({
    where: { tenantId_alias: { tenantId: t, alias: 'dataflow' } },
    update: { currency: 'INR' },
    create: { tenantId: t, name: 'DataFlow Labs', alias: 'dataflow', email: 'accounts@dataflow.dev', currency: 'INR' },
  });
  const customers = [acmeCustomer, techstartCustomer, dataflowCustomer];

  // ─── Demo End-User Accounts (upsert — real user accounts never affected) ─
  const endUser1 = await prisma.user.upsert({
    where: { email: 'user@acme.com' },
    update: {},
    create: { email: 'user@acme.com', passwordHash, displayName: 'Alice (Acme)', role: 'user', organizationId: org.id, tenantId: t, customerId: customers[0].id, isVerified: true, lastLoginAt: new Date() },
  });
  const endUser2 = await prisma.user.upsert({
    where: { email: 'user@techstart.io' },
    update: {},
    create: { email: 'user@techstart.io', passwordHash, displayName: 'Bob (TechStart)', role: 'user', organizationId: org.id, tenantId: t, customerId: customers[1].id, isVerified: true, lastLoginAt: new Date(Date.now() - 3 * 86400000) },
  });

  // ─── New models: Preferences, Notifications, Sessions, Payment Methods ──
  // Only create if they don't already exist (idempotent)
  await prisma.notificationPreference.upsert({
    where: { userId: endUser1.id },
    update: {},
    create: { userId: endUser1.id },
  });
  await prisma.notificationPreference.upsert({
    where: { userId: endUser2.id },
    update: {},
    create: { userId: endUser2.id },
  });

  // User preferences (upsert)
  await prisma.userPreference.upsert({
    where: { userId: endUser1.id },
    update: {},
    create: { userId: endUser1.id, timezone: 'US/Eastern', dateFormat: 'MM/DD/YYYY' },
  });
  await prisma.userPreference.upsert({
    where: { userId: endUser2.id },
    update: {},
    create: { userId: endUser2.id, timezone: 'US/Pacific', dateFormat: 'YYYY-MM-DD' },
  });

  // Sample sessions (always create fresh — sessions accumulate naturally)
  const sessionExpiry = new Date(Date.now() + 7 * 86400000);
  await prisma.userSession.createMany({
    data: [
      { userId: endUser1.id, ipAddress: '192.168.1.42', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0', isActive: true, expiresAt: sessionExpiry },
      { userId: endUser2.id, ipAddress: '172.16.0.100', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126.0', isActive: true, expiresAt: sessionExpiry },
    ],
  });


  // Notifications — only seed if user has none yet
  const existingNotifs1 = await prisma.notification.count({ where: { userId: endUser1.id } });
  if (existingNotifs1 === 0) {
    await prisma.notification.createMany({
      data: [
        { userId: endUser1.id, type: 'account', title: 'Welcome to CloudVitta!', message: 'Your account has been created. Start by uploading files to your storage bucket.' },
        { userId: endUser1.id, type: 'billing', title: 'Subscription activated', message: 'You are now subscribed to the Pro plan at ₹200/month.' },
        { userId: endUser1.id, type: 'storage', title: 'Storage at 75%', message: 'You have used 75% of your 1 GB storage quota. Consider upgrading your plan.', isRead: true },
        { userId: endUser1.id, type: 'security', title: 'New login detected', message: 'New login from Chrome on Windows 10 (192.168.1.42)' },
      ],
    });
  }
  const existingNotifs2 = await prisma.notification.count({ where: { userId: endUser2.id } });
  if (existingNotifs2 === 0) {
    await prisma.notification.createMany({
      data: [
        { userId: endUser2.id, type: 'account', title: 'Welcome to CloudVitta!', message: 'Your account has been created. Start by uploading files to your storage bucket.' },
        { userId: endUser2.id, type: 'billing', title: 'Free plan activated', message: 'You are on the Free plan with 500 MB storage.', isRead: true },
      ],
    });
  }

  // Payment methods for Acme Corp — only if none exist yet
  const existingPMs = await prisma.paymentMethod.count({ where: { customerId: customers[0].id } });
  if (existingPMs === 0) {
    await prisma.paymentMethod.createMany({
      data: [
        { customerId: customers[0].id, tenantId: t, type: 'card', brand: 'visa', last4: '4242', expMonth: 12, expYear: 2028, isDefault: true },
        { customerId: customers[0].id, tenantId: t, type: 'card', brand: 'mastercard', last4: '8888', expMonth: 6, expYear: 2027, isDefault: false },
      ],
    });
  }



  // ─── Coupons ───────────────────────────────────────────
  await prisma.coupon.createMany({
    data: [
      { tenantId: t, code: 'WELCOME20', description: '20% off first month', discountType: 'PERCENTAGE', discountValue: 20, maxRedemptions: 100 },
      { tenantId: t, code: 'FREEUPGRADE', description: 'Free upgrade to Pro for 1 month', discountType: 'PERCENTAGE', discountValue: 100, maxRedemptions: 50 },
    ],
  });

  const coupons = await prisma.coupon.findMany({ where: { tenantId: t } });

  // ─── Add-ons ───────────────────────────────────────────
  await prisma.addon.createMany({
    data: [
      { tenantId: t, name: 'Priority Support', description: '24/7 dedicated support', feeType: 'RECURRING', priceCents: 50000 },
      { tenantId: t, name: 'Custom Domain', description: 'Bring your own domain for buckets', feeType: 'ONETIME', priceCents: 10000 },
    ],
  });

  const addons = await prisma.addon.findMany({ where: { tenantId: t } });

  // ─── Subscriptions ─────────────────────────────────────
  const now = new Date();
  const ago = (days) => new Date(now.getTime() - days * 86400000);

  async function createSub(customerId, planVersionId, status, startDaysAgo, opts = {}) {
    const start = ago(startDaysAgo);
    const planVer = await prisma.planVersion.findUnique({ where: { id: planVersionId }, include: { priceComponents: true } });
    const sub = await prisma.subscription.create({
      data: {
        tenantId: t, customerId, planVersionId, status,
        billingStartDate: start, billingDay: start.getDate(),
        couponId: opts.couponId || null,
        ...(opts.currentPeriodEnd && { currentPeriodStart: opts.currentPeriodStart || now, currentPeriodEnd: opts.currentPeriodEnd }),
        ...(status === 'TRIAL' && { trialStartDate: start, trialEndDate: new Date(start.getTime() + (planVer?.trialDays || 7) * 86400000) }),
        ...(status === 'CANCELLED' && { cancelledAt: ago(opts.cancelDaysAgo || 5), cancelReason: 'Switched to competitor' }),
      },
    });
    await prisma.subscriptionComponent.createMany({
      data: planVer.priceComponents.map((pc) => ({ subscriptionId: sub.id, priceComponentId: pc.id })),
    });
    if (opts.addonIds) {
      await prisma.subscriptionAddon.createMany({
        data: opts.addonIds.map((id) => ({ subscriptionId: sub.id, addonId: id, quantity: 1 })),
      });
    }
    return sub;
  }

  // Acme Corp: Pro ₹200/mo plan (active 60 days, paid through next month)
  const sub1 = await createSub(customers[0].id, proVersion.id, 'ACTIVE', 60, {
    addonIds: [addons[0].id],
    currentPeriodStart: now,
    currentPeriodEnd: new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()),
  });
  // TechStart: Free plan (active 30 days)
  const sub2 = await createSub(customers[1].id, freeVersion.id, 'ACTIVE', 30);
  // DataFlow: Pro ₹200/mo plan (trial — 3 days in)
  const sub3 = await createSub(customers[2].id, proVersion.id, 'TRIAL', 3);

  // ─── Storage Buckets (demo data — metadata only, no actual OCI objects) ──
  console.log('  📦 Creating storage bucket metadata...');

  const bucketConfigs = [
    { customer: customers[0], name: 'acme-files', sizeMB: 720, objects: 85 },      // Pro: 1GB cap, using 720 MB
    { customer: customers[1], name: 'techstart-uploads', sizeMB: 380, objects: 42 }, // Free: 500MB cap, using 380 MB
    { customer: customers[2], name: 'dataflow-data', sizeMB: 150, objects: 18 },     // Pro trial: 1GB cap, using 150 MB
  ];

  for (const config of bucketConfigs) {
    const usedBytes = BigInt(Math.round(config.sizeMB * 1024 * 1024));
    await prisma.storageBucket.create({
      data: {
        tenantId: t,
        customerId: config.customer.id,
        name: config.name,
        usedBytes,
        objectCount: config.objects,
      },
    });
  }

  // ─── Usage Events (simulated 30 days) ──────────────────
  console.log('  📊 Generating usage events...');
  const eventData = [];

  for (const customer of customers) {
    const buckets = bucketConfigs.filter(b => b.customer.id === customer.id);
    const totalMB = buckets.reduce((sum, b) => sum + b.sizeMB, 0);

    for (let day = 0; day < 30; day++) {
      const date = ago(day);

      // PUT operations (2-15 per day)
      const putCount = Math.floor(Math.random() * 13) + 2;
      for (let i = 0; i < Math.min(putCount, 3); i++) {
        eventData.push({
          tenantId: t, customerId: customer.id, eventCode: 'storage_put_ops',
          timestamp: new Date(date.getTime() + Math.random() * 86400000),
          properties: JSON.stringify({ bucketId: buckets[0]?.name || 'default' }),
        });
      }

      // GET operations (10-100 per day)
      const getCount = Math.floor(Math.random() * 90) + 10;
      for (let i = 0; i < Math.min(getCount, 5); i++) {
        eventData.push({
          tenantId: t, customerId: customer.id, eventCode: 'storage_get_ops',
          timestamp: new Date(date.getTime() + Math.random() * 86400000),
          properties: JSON.stringify({ bucketId: buckets[0]?.name || 'default', operation: 'GET' }),
        });
      }

      // DELETE operations (0-2 per day)
      if (Math.random() > 0.7) {
        eventData.push({
          tenantId: t, customerId: customer.id, eventCode: 'storage_delete_ops',
          timestamp: new Date(date.getTime() + Math.random() * 86400000),
          properties: JSON.stringify({}),
        });
      }

      // Egress bandwidth (10-200 MB per day)
      const egressMB = (Math.random() * 190 + 10) * (totalMB / 500);
      eventData.push({
        tenantId: t, customerId: customer.id, eventCode: 'storage_egress_bytes',
        timestamp: new Date(date.getTime() + Math.random() * 86400000),
        properties: JSON.stringify({ bytes: Math.round(egressMB * 1024 * 1024) }),
      });

      // Ingress bandwidth (5-100 MB per day)
      const ingressMB = (Math.random() * 95 + 5) * (totalMB / 1000);
      eventData.push({
        tenantId: t, customerId: customer.id, eventCode: 'storage_ingress_bytes',
        timestamp: new Date(date.getTime() + Math.random() * 86400000),
        properties: JSON.stringify({ bytes: Math.round(ingressMB * 1024 * 1024) }),
      });
    }
  }

  // Batch insert events
  const batchSize = 100;
  for (let i = 0; i < eventData.length; i += batchSize) {
    await prisma.usageEvent.createMany({ data: eventData.slice(i, i + batchSize) });
  }
  console.log(`  ✓ Created ${eventData.length} usage events`);

  // ─── Storage Snapshots (every 4 hours for 30 days) ────────
  console.log('  📸 Generating storage snapshots...');
  const snapshotData = [];

  for (const customer of customers) {
    const buckets = bucketConfigs.filter(b => b.customer.id === customer.id);
    const baseBytes = buckets.reduce((sum, b) => sum + b.sizeMB * 1024 * 1024, 0);

    for (let hour = 0; hour < 30 * 24; hour += 4) {
      const snapshotTime = new Date(now.getTime() - hour * 60 * 60 * 1000);
      const growthFactor = 1 - (hour / (30 * 24)) * 0.15 + (Math.random() - 0.5) * 0.02;
      const usedBytes = BigInt(Math.round(baseBytes * growthFactor));
      const objectCount = Math.round(buckets.reduce((sum, b) => sum + b.objects, 0) * growthFactor);

      snapshotData.push({
        tenantId: t,
        customerId: customer.id,
        bucketId: null,
        usedBytes,
        objectCount,
        snapshotTime,
      });
    }
  }

  for (let i = 0; i < snapshotData.length; i += batchSize) {
    await prisma.storageSnapshot.createMany({ data: snapshotData.slice(i, i + batchSize) });
  }
  console.log(`  ✓ Created ${snapshotData.length} storage snapshots`);

  // ─── Invoices ──────────────────────────────────────────
  const invoices = [];
  let invNum = 1;

  for (let month = 2; month >= 0; month--) {
    const periodStart = new Date(now.getFullYear(), now.getMonth() - month, 1);
    const periodEnd = new Date(now.getFullYear(), now.getMonth() - month + 1, 0, 23, 59, 59);
    const dueDate = new Date(periodEnd.getTime() + 30 * 86400000);

    // Acme Corp (Pro ₹200/mo)
    const acmeTotal = 20000; // ₹200.00 in paise
    invoices.push({
      tenantId: t, customerId: customers[0].id, subscriptionId: sub1.id,
      invoiceNumber: `INV-${String(invNum++).padStart(5, '0')}`,
      status: month > 0 ? 'PAID' : 'FINALIZED',
      currency: 'INR', subtotalCents: acmeTotal, taxCents: 0, totalCents: acmeTotal, amountDueCents: month > 0 ? 0 : acmeTotal,
      periodStart, periodEnd, dueDate, paidAt: month > 0 ? new Date(periodEnd.getTime() + 10 * 86400000) : null,
    });

    // TechStart (Free — ₹0 invoices for record keeping)
    if (month <= 1) {
      invoices.push({
        tenantId: t, customerId: customers[1].id, subscriptionId: sub2.id,
        invoiceNumber: `INV-${String(invNum++).padStart(5, '0')}`,
        status: 'PAID',
        currency: 'INR', subtotalCents: 0, taxCents: 0, totalCents: 0, amountDueCents: 0,
        periodStart, periodEnd, dueDate, paidAt: new Date(periodEnd.getTime() + 1 * 86400000),
      });
    }
  }

  await prisma.invoice.createMany({ data: invoices });

  // Add invoice lines
  const createdInvoices = await prisma.invoice.findMany({ where: { tenantId: t }, orderBy: { createdAt: 'asc' } });
  for (const inv of createdInvoices) {
    const isPro = inv.customerId === customers[0].id;
    const baseAmount = isPro ? 20000 : 0;

    await prisma.invoiceLine.createMany({
      data: [
        { invoiceId: inv.id, name: isPro ? 'Pro Plan — Monthly Fee' : 'Free Plan', description: isPro ? '1 GB storage, ₹200/month' : '500 MB storage, free', quantity: 1, unitPriceCents: baseAmount, totalCents: baseAmount, metadata: '{"type":"recurring"}' },
      ],
    });
  }

  // ─── Invoicing Entity ──────────────────────────────────
  await prisma.invoicingEntity.create({
    data: {
      tenantId: t, legalName: 'CloudVitta Inc.', taxId: '29ABCDE1234F1Z5',
      addressLine1: '100 Innovation Park', city: 'Bengaluru', state: 'KA',
      zipCode: '560001', country: 'IN', footerNote: 'Thank you for choosing CloudVitta Object Storage!',
    },
  });

  // ─── Summary ───────────────────────────────────────────
  const counts = {
    organizations: await prisma.organization.count(),
    tenants: await prisma.tenant.count(),
    users: await prisma.user.count(),
    customers: await prisma.customer.count(),
    productFamilies: await prisma.productFamily.count(),
    billableMetrics: await prisma.billableMetric.count(),
    plans: await prisma.plan.count(),
    planVersions: await prisma.planVersion.count(),
    priceComponents: await prisma.priceComponent.count(),
    subscriptions: await prisma.subscription.count(),
    invoices: await prisma.invoice.count(),
    storageBuckets: await prisma.storageBucket.count(),
    storageBuckets: await prisma.storageBucket.count(),
    storageSnapshots: await prisma.storageSnapshot.count(),
    usageEvents: await prisma.usageEvent.count(),
    userSessions: await prisma.userSession.count(),
    notifications: await prisma.notification.count(),
    notificationPreferences: await prisma.notificationPreference.count(),
    paymentMethods: await prisma.paymentMethod.count(),
    userPreferences: await prisma.userPreference.count(),
  };

  console.log('\n✅ Seed complete! Summary:');
  console.table(counts);
  console.log('\n🔐 Login credentials:');
  console.log('   Admin:    admin@cloudvitta.dev / password123');
  console.log('   End-user: user@acme.com / password123  (Acme Corp — Pro 1GB)');
  console.log('   End-user: user@techstart.io / password123  (TechStart — Free 500MB)');
  console.log('\n📦 Storage plans: Free (500 MB), Pro (1 GB — ₹200/mo)');
  console.log('🌐 Global platform cap: 15 GB (all users combined)');
}

seed()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
