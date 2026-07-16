/**
 * CloudVitta Seed / Bootstrap Script
 *
 * Prepares a clean, production-ready baseline:
 *   - The product catalog required for the app to function
 *     (Object Storage product family, billable metrics, Free & Pro plans,
 *      add-ons, coupons, invoicing entity).
 *   - A SINGLE administrator account, provisioned from environment variables
 *     (ADMIN_EMAIL / ADMIN_PASSWORD). No credentials are hardcoded here.
 *
 * It is idempotent and safe to re-run:
 *   - The administrator is upserted by email — re-running never creates a
 *     duplicate and never overwrites an existing admin's password.
 *   - Any legacy demo accounts / customers from earlier development seeds are
 *     removed.
 *
 * Required environment variables (set in backend/.env — see backend/.env.example):
 *   ADMIN_EMAIL      e.g. admin@yourcompany.com
 *   ADMIN_PASSWORD   strong initial password (min 8 chars); change it after first login
 *
 * Plans:
 *   - Free: 500 MB storage, ₹0/mo (hard cap)
 *   - Pro: 1 GB storage, ₹200/mo (hard cap)
 * Global platform cap: 15 GB (all users combined)
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load backend/.env so ADMIN_EMAIL / ADMIN_PASSWORD are available when the
// seed is run directly (e.g. `node prisma/seed.js`), not just via the app.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const prisma = new PrismaClient();

// Password hashing must match the rest of the application (bcrypt, 12 rounds).
const BCRYPT_ROUNDS = 12;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

// Legacy development/demo accounts to purge if a previous seed created them.
const LEGACY_DEMO_USER_EMAILS = [
  'admin@cloudvitta.dev',
  'member@cloudvitta.dev',
  'user@acme.com',
  'user@techstart.io',
];
const LEGACY_DEMO_CUSTOMER_ALIASES = ['acme', 'techstart', 'dataflow'];

function readAdminCredentials() {
  const email = (process.env.ADMIN_EMAIL || '').trim();
  const password = process.env.ADMIN_PASSWORD || '';

  const problems = [];
  if (!email) problems.push('ADMIN_EMAIL is not set');
  else if (!EMAIL_REGEX.test(email)) problems.push('ADMIN_EMAIL is not a valid email address');
  if (!password) problems.push('ADMIN_PASSWORD is not set');
  else if (password.length < MIN_PASSWORD_LENGTH) {
    problems.push(`ADMIN_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters`);
  }

  if (problems.length > 0) {
    console.error('\n❌ Cannot seed the administrator account:');
    for (const p of problems) console.error(`   • ${p}`);
    console.error('\n   Set them in backend/.env (see backend/.env.example), for example:');
    console.error('     ADMIN_EMAIL=admin@yourcompany.com');
    console.error('     ADMIN_PASSWORD=<a-strong-password>\n');
    process.exit(1);
  }

  return { email, password };
}

async function seed() {
  console.log('🌱 Seeding CloudVitta database (production baseline)...\n');

  const admin = readAdminCredentials();

  // ─── Remove legacy demo accounts (idempotent — no-ops if already gone) ───
  // Users must be removed before their customers (User.customerId FK). Deleting
  // a User cascades its sessions, notifications, and preferences.
  const deletedUsers = await prisma.user.deleteMany({
    where: { email: { in: LEGACY_DEMO_USER_EMAILS } },
  });
  if (deletedUsers.count > 0) console.log(`✓ Removed ${deletedUsers.count} legacy demo user account(s)`);

  // ─── Reset catalog / billing / storage / payment data ───────────────────
  // Real end-user *accounts* (created via public signup) are preserved; their
  // catalog/billing/storage rows are reset to a clean baseline (re-runnable).
  await prisma.$transaction([
    prisma.pendingRegistration.deleteMany(),
    prisma.storageSnapshot.deleteMany(),
    prisma.storageObject.deleteMany(),
    prisma.storageBucket.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.paymentWebhookEvent.deleteMany(),
    prisma.paymentMethod.deleteMany(),
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
  console.log('✓ Catalog & billing data reset');

  // Demo customers can now be removed (their dependent rows are gone above).
  const deletedCustomers = await prisma.customer.deleteMany({
    where: { alias: { in: LEGACY_DEMO_CUSTOMER_ALIASES } },
  });
  if (deletedCustomers.count > 0) console.log(`✓ Removed ${deletedCustomers.count} legacy demo customer(s)`);

  // ─── Organization & Tenant ──────────────────────────────────────────────
  // Migrate a legacy demo organization to the production identity in place,
  // so re-seeding an older dev database doesn't create a duplicate org.
  const legacyOrg = await prisma.organization.findUnique({ where: { slug: 'cloudvitta-demo' } });
  if (legacyOrg) {
    await prisma.organization.update({
      where: { id: legacyOrg.id },
      data: { name: 'CloudVitta', slug: 'cloudvitta' },
    });
  }

  const org = await prisma.organization.upsert({
    where: { slug: 'cloudvitta' },
    update: { name: 'CloudVitta' },
    create: { name: 'CloudVitta', slug: 'cloudvitta' },
  });

  const prodTenant = await prisma.tenant.upsert({
    where: { slug_organizationId: { slug: 'production', organizationId: org.id } },
    update: { currency: 'INR' },
    create: { name: 'Production', slug: 'production', organizationId: org.id, currency: 'INR' },
  });

  // Drop a stale demo "Sandbox" tenant if one lingers from an earlier seed.
  await prisma.tenant
    .deleteMany({ where: { organizationId: org.id, slug: 'sandbox' } })
    .catch(() => { /* has dependents — leave it */ });

  const t = prodTenant.id; // shorthand

  // ─── Product Catalog ────────────────────────────────────────────────────
  const storageFamily = await prisma.productFamily.create({ data: { tenantId: t, name: 'Object Storage' } });

  await prisma.product.create({
    data: { tenantId: t, productFamilyId: storageFamily.id, name: 'Cloud Object Storage', description: 'S3-compatible multi-tenant object storage' },
  });

  // ─── Storage Billable Metrics ───────────────────────────────────────────
  const storageMetric = await prisma.billableMetric.create({
    data: { tenantId: t, name: 'Storage Used (GB)', code: 'storage_bytes_stored', aggregationType: 'MAX', aggregationKey: 'gb_used', description: 'Average GB stored per billing period (GB-hours)' },
  });
  const putOpsMetric = await prisma.billableMetric.create({
    data: { tenantId: t, name: 'PUT Operations', code: 'storage_put_ops', aggregationType: 'COUNT', description: 'Number of PUT/POST/COPY object operations' },
  });
  const getOpsMetric = await prisma.billableMetric.create({
    data: { tenantId: t, name: 'GET Operations', code: 'storage_get_ops', aggregationType: 'COUNT', description: 'Number of GET/HEAD/LIST object operations' },
  });
  await prisma.billableMetric.create({
    data: { tenantId: t, name: 'DELETE Operations', code: 'storage_delete_ops', aggregationType: 'COUNT', description: 'Number of DELETE operations' },
  });
  await prisma.billableMetric.create({
    data: { tenantId: t, name: 'Egress Bandwidth (GB)', code: 'storage_egress_bytes', aggregationType: 'SUM', aggregationKey: 'bytes', description: 'Data downloaded from storage (egress)' },
  });
  await prisma.billableMetric.create({
    data: { tenantId: t, name: 'Ingress Bandwidth (GB)', code: 'storage_ingress_bytes', aggregationType: 'SUM', aggregationKey: 'bytes', description: 'Data uploaded to storage (ingress)' },
  });

  // ─── Storage Plans ──────────────────────────────────────────────────────

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
      // Egress is tracked internally (metric + events) but NOT a billable plan component.
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
      // Egress is tracked internally (metric + events) but NOT a billable plan component.
    ],
  });
  console.log('✓ Product catalog & plans created (Free 500 MB, Pro 1 GB — ₹200/mo)');

  // ─── Add-ons ────────────────────────────────────────────────────────────
  await prisma.addon.createMany({
    data: [
      { tenantId: t, name: 'Priority Support', description: '24/7 dedicated support', feeType: 'RECURRING', priceCents: 50000 },
      { tenantId: t, name: 'Custom Domain', description: 'Bring your own domain for buckets', feeType: 'ONETIME', priceCents: 10000 },
    ],
  });

  // ─── Coupons ────────────────────────────────────────────────────────────
  await prisma.coupon.createMany({
    data: [
      { tenantId: t, code: 'WELCOME20', description: '20% off first month', discountType: 'PERCENTAGE', discountValue: 20, maxRedemptions: 100 },
      { tenantId: t, code: 'FREEUPGRADE', description: 'Free upgrade to Pro for 1 month', discountType: 'PERCENTAGE', discountValue: 100, maxRedemptions: 50 },
    ],
  });

  // ─── Invoicing Entity (placeholder — edit via admin Settings) ───────────
  await prisma.invoicingEntity.create({
    data: {
      tenantId: t, legalName: 'CloudVitta Inc.', taxId: '29ABCDE1234F1Z5',
      addressLine1: '100 Innovation Park', city: 'Bengaluru', state: 'KA',
      zipCode: '560001', country: 'IN', footerNote: 'Thank you for choosing CloudVitta Object Storage!',
    },
  });

  // ─── Administrator Account (env-driven, idempotent, no duplicates) ──────
  const existingAdmin = await prisma.user.findUnique({ where: { email: admin.email } });
  if (existingAdmin) {
    // Never overwrite an existing admin's password on re-seed. Just make sure
    // the account still has full privileges and is usable.
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: {
        role: 'admin',
        isVerified: true,
        deactivatedAt: null,
        organizationId: org.id,
        tenantId: prodTenant.id,
      },
    });
    console.log(`✓ Administrator already exists — ensured full privileges (${admin.email})`);
  } else {
    const passwordHash = await bcrypt.hash(admin.password, BCRYPT_ROUNDS);
    await prisma.user.create({
      data: {
        email: admin.email,
        passwordHash,
        displayName: 'Administrator',
        role: 'admin',
        organizationId: org.id,
        tenantId: prodTenant.id,
        isVerified: true,
      },
    });
    console.log(`✓ Administrator account created (${admin.email})`);
  }

  // ─── Summary ────────────────────────────────────────────────────────────
  const counts = {
    organizations: await prisma.organization.count(),
    tenants: await prisma.tenant.count(),
    users: await prisma.user.count(),
    admins: await prisma.user.count({ where: { role: 'admin' } }),
    plans: await prisma.plan.count(),
    planVersions: await prisma.planVersion.count(),
    priceComponents: await prisma.priceComponent.count(),
    addons: await prisma.addon.count(),
    coupons: await prisma.coupon.count(),
  };

  console.log('\n✅ Seed complete! Summary:');
  console.table(counts);
  console.log('\n🔐 Administrator sign-in:');
  console.log(`   Email:    ${admin.email}`);
  console.log('   Password: (the ADMIN_PASSWORD you configured — change it after first login)');
  console.log('\n📦 Storage plans: Free (500 MB), Pro (1 GB — ₹200/mo)');
  console.log('🌐 Global platform cap: 15 GB (all users combined)');
}

seed()
  .catch((e) => { console.error('Seed failed:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
