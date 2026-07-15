import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

import authRoutes from './routes/auth.js';
import organizationRoutes from './routes/organizations.js';
import tenantRoutes from './routes/tenants.js';
import customerRoutes from './routes/customers.js';
import productFamilyRoutes from './routes/productFamilies.js';
import productRoutes from './routes/products.js';
import billableMetricRoutes from './routes/billableMetrics.js';
import planRoutes from './routes/plans.js';
import subscriptionRoutes from './routes/subscriptions.js';
import invoiceRoutes from './routes/invoices.js';
import creditNoteRoutes from './routes/creditNotes.js';
import couponRoutes from './routes/coupons.js';
import addonRoutes from './routes/addons.js';
import eventRoutes from './routes/events.js';
import statsRoutes from './routes/stats.js';
import apiTokenRoutes from './routes/apiTokens.js';
import webhookRoutes from './routes/webhooks.js';
import settingsRoutes from './routes/settings.js';
import storageRoutes from './routes/storage.js';
import portalRoutes from './routes/portal.js';
import portalAccountRoutes from './routes/portalAccount.js';
import portalSettingsRoutes from './routes/portalSettings.js';
import portalBillingRoutes from './routes/portalBilling.js';
import portalPaymentRoutes from './routes/portalPayments.js';
import paymentWebhookRoutes from './routes/paymentWebhook.js';
import portalNotificationRoutes from './routes/portalNotifications.js';
import adminUserRoutes from './routes/adminUsers.js';
import { errorHandler } from './utils/errors.js';
import { startScheduler } from './services/scheduler.js';
import { verifyOCIConnection } from './services/ociStorageClient.js';

dotenv.config();

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 3000;

// Make prisma available to all routes
app.locals.prisma = prisma;

// Security headers
app.use(helmet({ contentSecurityPolicy: false })); // CSP disabled to allow frontend SPA

// Middleware
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'], credentials: true }));

// Request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    if (req.path !== '/api/health') {
      console.log(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// Razorpay webhook needs the raw request body for HMAC signature verification,
// so it is mounted BEFORE the global JSON body parser.
app.use('/api/payments/webhook', paymentWebhookRoutes);

app.use(express.json({ limit: '10mb' }));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'CloudVitta API', timestamp: new Date().toISOString() });
});

// Public routes
app.use('/api/auth', authRoutes);

// Protected routes (all require auth — the middleware is applied within each router)
app.use('/api/organizations', organizationRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/product-families', productFamilyRoutes);
app.use('/api/products', productRoutes);
app.use('/api/billable-metrics', billableMetricRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/credit-notes', creditNoteRoutes);
app.use('/api/coupons', couponRoutes);
app.use('/api/addons', addonRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/api-tokens', apiTokenRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/storage', storageRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/portal/account', portalAccountRoutes);
app.use('/api/portal/settings', portalSettingsRoutes);
app.use('/api/portal/billing/payments', portalPaymentRoutes);
app.use('/api/portal/billing', portalBillingRoutes);
app.use('/api/portal/notifications', portalNotificationRoutes);
app.use('/api/users', adminUserRoutes);

// Global error handler
app.use(errorHandler);

// Start server
app.listen(PORT, async () => {
  console.log(`☁️  CloudVitta API running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  try {
    await verifyOCIConnection();
  } catch (err) {
    console.error('❌ Oracle Cloud Storage connection failed:', err.message);
    console.error('   The server will continue running but file uploads/downloads will fail.');
    console.error('   Fix your OCI_S3_* environment variables and restart.');
  }
  startScheduler(prisma);
});

// Graceful shutdown
const shutdown = async (signal) => {
  console.log(`\n${signal} received — shutting down gracefully…`);
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
