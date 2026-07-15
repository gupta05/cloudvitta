import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { generateToken } from '../middleware/auth.js';
import { createBucket } from '../services/storageService.js';
import { sendOtpEmail, sendPasswordResetEmail } from '../services/emailService.js';
import {
  generateOtp,
  createPendingRegistration,
  verifyOtp,
  canResendOtp,
  regenerateOtp,
  deletePendingRegistration,
  createPasswordResetRequest,
  verifyPasswordResetOtp,
  canResendPasswordReset,
  regeneratePasswordResetOtp,
  deletePasswordResetRequest,
} from '../services/otpService.js';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Generic response for forgot-password — identical whether or not the account exists,
// to prevent user-enumeration via the API.
const FORGOT_PASSWORD_GENERIC_MESSAGE =
  'If an account exists for this email, a password reset code has been sent.';

const router = Router();

// POST /api/auth/register — Start registration (creates pending record + sends OTP)
// Does NOT create a User. Account is only created after OTP verification.
router.post('/register', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { email, password, displayName } = req.body;

    if (!email || !password || !displayName) {
      return res.status(400).json({ error: 'email, password, and displayName are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }

    // Validate password strength
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if a verified user with this email already exists
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    // Hash password and generate OTP
    const passwordHash = await bcrypt.hash(password, 12);
    const otp = generateOtp();

    // Create (or replace) pending registration
    const pending = await createPendingRegistration(prisma, {
      email,
      passwordHash,
      displayName,
    }, otp);

    // Send OTP email
    try {
      await sendOtpEmail(email, displayName, otp);
    } catch (emailErr) {
      // Clean up pending registration if email fails
      try { await deletePendingRegistration(prisma, pending.id); } catch (_) { /* ignore */ }
      console.error('[Auth] Email send failed:', emailErr.message);
      return res.status(503).json({ error: 'Unable to send verification email. Please try again later.' });
    }

    res.status(200).json({
      message: 'Verification code sent to your email',
      email: pending.email,
      pendingId: pending.id,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/verify-otp — Verify OTP and create the full account
router.post('/verify-otp', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { pendingId, otp } = req.body;

    if (!pendingId || !otp) {
      return res.status(400).json({ error: 'pendingId and otp are required' });
    }

    // Validate OTP format (must be 6 digits)
    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: 'Verification code must be 6 digits' });
    }

    // Verify the OTP
    const verification = await verifyOtp(prisma, pendingId, otp);
    if (!verification.success) {
      return res.status(400).json({ error: verification.error });
    }

    const pending = verification.pending;

    // Double-check the email isn't already taken (race condition protection)
    const existingUser = await prisma.user.findUnique({ where: { email: pending.email } });
    if (existingUser) {
      await deletePendingRegistration(prisma, pendingId);
      return res.status(409).json({ error: 'A user with this email already exists' });
    }

    // OTP verified! Now create the full account (same logic as old register)
    const orgName = `${pending.displayName}'s Org`;
    const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const result = await prisma.$transaction(async (tx) => {
      // 1. Organization
      const org = await tx.organization.create({
        data: { name: orgName, slug: `${slug}-${Date.now().toString(36)}` },
      });

      // 2. Tenant
      const tenant = await tx.tenant.create({
        data: { name: 'Production', slug: 'production', organizationId: org.id },
      });

      // 3. Customer record (the billing entity for this user)
      const customerAlias = pending.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      const customer = await tx.customer.create({
        data: {
          tenantId: tenant.id,
          name: pending.displayName,
          alias: customerAlias,
          email: pending.email,
          currency: 'INR',
        },
      });

      // 4. User (linked to customer and tenant, verified!)
      const user = await tx.user.create({
        data: {
          email: pending.email,
          passwordHash: pending.passwordHash,
          displayName: pending.displayName,
          role: 'user', // Public sign-up is always 'user'
          organizationId: org.id,
          tenantId: tenant.id,
          customerId: customer.id,
          isVerified: true,
        },
      });

      // 5. Find the Free plan and create a subscription
      let freePlanVersion = null;
      const existingFreePlan = await tx.plan.findFirst({
        where: { planType: 'FREE', status: 'ACTIVE' },
        include: { versions: { where: { isActive: true }, take: 1 } },
      });

      if (existingFreePlan && existingFreePlan.versions.length > 0) {
        freePlanVersion = existingFreePlan.versions[0];
      }

      let subscription = null;
      if (freePlanVersion) {
        subscription = await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            customerId: customer.id,
            planVersionId: freePlanVersion.id,
            status: 'ACTIVE',
            billingStartDate: new Date(),
            billingDay: new Date().getDate(),
          },
        });

        // Create subscription components
        const components = await tx.priceComponent.findMany({
          where: { planVersionId: freePlanVersion.id },
        });
        if (components.length > 0) {
          await tx.subscriptionComponent.createMany({
            data: components.map((pc) => ({
              subscriptionId: subscription.id,
              priceComponentId: pc.id,
            })),
          });
        }
      }

      return { org, tenant, customer, user, subscription };
    });

    // 6. Create a default storage bucket (outside transaction for filesystem ops)
    const bucketName = `${pending.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '-')}-files`;
    try {
      const prismaClient = req.app.locals.prisma;
      await createBucket(prismaClient, result.tenant.id, result.customer.id, {
        name: bucketName.length >= 3 ? bucketName : `${bucketName}-storage`,
        region: 'us-east-1',
      });
    } catch (bucketErr) {
      console.warn(`[Register] Default bucket creation failed: ${bucketErr.message}`);
      // Don't fail registration if bucket creation fails
    }

    // 7. Clean up the pending registration
    await deletePendingRegistration(prisma, pendingId);

    // 8. Create session and generate JWT
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const session = await prisma.userSession.create({
      data: {
        userId: result.user.id,
        ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
        userAgent: req.headers['user-agent'] || '',
        expiresAt,
      },
    });

    await prisma.user.update({
      where: { id: result.user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = generateToken(result.user, session.id);

    // Create welcome notification (fire-and-forget)
    prisma.notification.create({
      data: {
        userId: result.user.id,
        type: 'account',
        title: 'Welcome to CloudVitta!',
        message: 'Your account has been created. Start by uploading files to your default storage bucket.',
      },
    }).catch(() => {});

    // Create default notification preferences (fire-and-forget)
    prisma.notificationPreference.create({
      data: { userId: result.user.id },
    }).catch(() => {});

    // Create default user preferences (fire-and-forget)
    prisma.userPreference.create({
      data: { userId: result.user.id },
    }).catch(() => {});

    res.status(201).json({
      token,
      user: {
        id: result.user.id,
        email: result.user.email,
        displayName: result.user.displayName,
        role: result.user.role,
        organizationId: result.org.id,
        customerId: result.customer.id,
        tenantId: result.tenant.id,
      },
      organization: { id: result.org.id, name: result.org.name, slug: result.org.slug },
      tenant: { id: result.tenant.id, name: result.tenant.name, slug: result.tenant.slug },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/resend-otp — Resend OTP with rate limiting
router.post('/resend-otp', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { pendingId } = req.body;

    if (!pendingId) {
      return res.status(400).json({ error: 'pendingId is required' });
    }

    // Check rate limit
    const resendCheck = await canResendOtp(prisma, pendingId);
    if (!resendCheck.allowed) {
      if (resendCheck.error) {
        return res.status(404).json({ error: resendCheck.error });
      }
      return res.status(429).json({
        error: `Please wait ${resendCheck.retryAfter} seconds before requesting a new code`,
        retryAfter: resendCheck.retryAfter,
      });
    }

    const pending = resendCheck.pending;

    // Generate and store new OTP
    const otp = generateOtp();
    await regenerateOtp(prisma, pendingId, otp);

    // Send the new OTP email
    try {
      await sendOtpEmail(pending.email, pending.displayName, otp);
    } catch (emailErr) {
      console.error('[Auth] Resend email failed:', emailErr.message);
      return res.status(503).json({ error: 'Unable to send verification email. Please try again later.' });
    }

    res.json({ message: 'A new verification code has been sent to your email' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/forgot-password — Start password reset (sends OTP if account exists)
// Always returns the same generic 200 response to prevent user enumeration.
router.post('/forgot-password', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { email } = req.body;

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }

    const user = await prisma.user.findUnique({ where: { email } });

    // Only generate an OTP + send an email for a real, active, verified account.
    // In every case we return the identical generic response below.
    if (user && !user.deactivatedAt && user.isVerified) {
      const otp = generateOtp();
      try {
        await createPasswordResetRequest(prisma, email, otp);
        await sendPasswordResetEmail(email, user.displayName, otp);
      } catch (emailErr) {
        // Clean up the reset request if the email couldn't be sent, so the user
        // isn't left with a valid code they never received.
        try { await deletePasswordResetRequest(prisma, email); } catch (_) { /* ignore */ }
        console.error('[Auth] Password reset email failed:', emailErr.message);
        return res.status(503).json({ error: 'Unable to send password reset email. Please try again later.' });
      }
    }

    res.status(200).json({ message: FORGOT_PASSWORD_GENERIC_MESSAGE, email });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/reset-password — Verify OTP and set a new password
router.post('/reset-password', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'email, otp, and newPassword are required' });
    }

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ error: 'Reset code must be 6 digits' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Verify the OTP against the reset request for this email
    const verification = await verifyPasswordResetOtp(prisma, email, otp);
    if (!verification.success) {
      return res.status(400).json({ error: verification.error });
    }

    // Load the user. If the account somehow no longer exists, clear the request and
    // return the same generic invalid-code error (no enumeration).
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.deactivatedAt) {
      await deletePasswordResetRequest(prisma, email);
      return res.status(400).json({ error: 'Invalid or expired reset code. Please request a new one.' });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update the password and revoke all existing sessions so any stolen/old
    // session tokens can no longer be used with the (now-changed) credentials.
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    await prisma.userSession.updateMany({
      where: { userId: user.id },
      data: { isActive: false },
    });

    // Clean up the consumed reset request
    await deletePasswordResetRequest(prisma, email);

    // Security notification (fire-and-forget)
    prisma.notification.create({
      data: {
        userId: user.id,
        type: 'security',
        title: 'Your password was changed',
        message: 'Your CloudVitta password was reset. If this wasn\'t you, contact support immediately.',
      },
    }).catch(() => {});

    res.json({ message: 'Your password has been reset. You can now sign in with your new password.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/resend-reset-otp — Resend the password reset OTP (rate-limited)
router.post('/resend-reset-otp', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { email } = req.body;

    if (!email || !EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }

    // Check the cooldown. If no reset is in progress, respond generically so we
    // don't reveal whether a reset was ever started for this email.
    const resendCheck = await canResendPasswordReset(prisma, email);
    if (!resendCheck.allowed) {
      if (resendCheck.retryAfter) {
        return res.status(429).json({
          error: `Please wait ${resendCheck.retryAfter} seconds before requesting a new code`,
          retryAfter: resendCheck.retryAfter,
        });
      }
      // No request in progress — return generic success without doing anything.
      return res.status(200).json({ message: FORGOT_PASSWORD_GENERIC_MESSAGE });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || user.deactivatedAt || !user.isVerified) {
      // Shouldn't normally happen (a request only exists for a real account),
      // but stay generic and clean up just in case.
      await deletePasswordResetRequest(prisma, email);
      return res.status(200).json({ message: FORGOT_PASSWORD_GENERIC_MESSAGE });
    }

    const otp = generateOtp();
    await regeneratePasswordResetOtp(prisma, email, otp);

    try {
      await sendPasswordResetEmail(email, user.displayName, otp);
    } catch (emailErr) {
      console.error('[Auth] Password reset resend email failed:', emailErr.message);
      return res.status(503).json({ error: 'Unable to send password reset email. Please try again later.' });
    }

    res.json({ message: 'A new password reset code has been sent to your email' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        organization: {
          include: { tenants: { select: { id: true, name: true, slug: true } } },
        },
      },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Block login for deactivated accounts
    if (user.deactivatedAt) {
      return res.status(403).json({ error: 'This account has been deactivated. Contact support.' });
    }

    // Block login for unverified accounts
    if (!user.isVerified) {
      return res.status(403).json({ error: 'Please verify your email address before logging in' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Create a session record
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    const session = await prisma.userSession.create({
      data: {
        userId: user.id,
        ipAddress: req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '',
        userAgent: req.headers['user-agent'] || '',
        expiresAt,
      },
    });

    // Update lastLoginAt
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const token = generateToken(user, session.id);

    // Create login notification (fire-and-forget)
    prisma.notification.create({
      data: {
        userId: user.id,
        type: 'security',
        title: 'New login detected',
        message: `New login from ${req.headers['user-agent']?.substring(0, 60) || 'Unknown device'}`,
        metadata: JSON.stringify({ ip: session.ipAddress }),
      },
    }).catch(() => {});

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        organizationId: user.organizationId,
        customerId: user.customerId,
        tenantId: user.tenantId,
      },
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        slug: user.organization.slug,
      },
      tenants: user.organization.tenants,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout — invalidate current session
router.post('/logout', async (req, res, next) => {
  try {
    const { authenticate } = await import('../middleware/auth.js');
    authenticate(req, res, async () => {
      const prisma = req.app.locals.prisma;
      if (req.user.sessionId) {
        await prisma.userSession.update({
          where: { id: req.user.sessionId },
          data: { isActive: false },
        }).catch(() => {});
      }
      res.json({ message: 'Logged out' });
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me — get current user
router.get('/me', async (req, res, next) => {
  try {
    const { authenticate } = await import('../middleware/auth.js');
    authenticate(req, res, async () => {
      const prisma = req.app.locals.prisma;
      const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        include: {
          organization: {
            include: { tenants: { select: { id: true, name: true, slug: true } } },
          },
        },
      });
      if (!user) return res.status(404).json({ error: 'User not found' });
      if (user.deactivatedAt) return res.status(403).json({ error: 'Account deactivated' });
      res.json({
        user: {
          id: user.id,
          email: user.email,
          displayName: user.displayName,
          role: user.role,
          organizationId: user.organizationId,
          customerId: user.customerId,
          tenantId: user.tenantId,
          phone: user.phone,
          isVerified: user.isVerified,
          lastLoginAt: user.lastLoginAt,
          createdAt: user.createdAt,
        },
        organization: {
          id: user.organization.id,
          name: user.organization.name,
          slug: user.organization.slug,
        },
        tenants: user.organization.tenants,
      });
    });
  } catch (err) {
    next(err);
  }
});

export default router;
