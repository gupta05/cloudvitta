/**
 * OTP Service
 * Handles secure OTP generation, hashing, storage, and verification.
 * Uses crypto.randomInt for cryptographically secure OTP generation.
 */

import crypto from 'crypto';
import bcrypt from 'bcryptjs';

const OTP_LENGTH = 6;
const OTP_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Generate a cryptographically secure 6-digit OTP.
 * @returns {string} 6-digit OTP string (zero-padded)
 */
export function generateOtp() {
  const min = Math.pow(10, OTP_LENGTH - 1); // 100000
  const max = Math.pow(10, OTP_LENGTH);      // 1000000
  return crypto.randomInt(min, max).toString();
}

/**
 * Create a new pending registration with a hashed OTP.
 * If a pending registration already exists for this email, it is replaced.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {{ email: string, passwordHash: string, displayName: string }} userData
 * @param {string} otp - The plain 6-digit OTP
 * @returns {Promise<{ id: string, email: string }>} The pending registration record
 */
export async function createPendingRegistration(prisma, userData, otp) {
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  // Upsert: if email already has a pending registration, replace it
  const pending = await prisma.pendingRegistration.upsert({
    where: { email: userData.email },
    update: {
      passwordHash: userData.passwordHash,
      displayName: userData.displayName,
      otpHash,
      expiresAt,
      attempts: 0,
      lastSentAt: new Date(),
    },
    create: {
      email: userData.email,
      passwordHash: userData.passwordHash,
      displayName: userData.displayName,
      otpHash,
      expiresAt,
      lastSentAt: new Date(),
    },
  });

  return { id: pending.id, email: pending.email };
}

/**
 * Verify an OTP against a pending registration.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} pendingId - The pending registration ID
 * @param {string} otp - The plain OTP to verify
 * @returns {Promise<{ success: boolean, error?: string, pending?: object }>}
 */
export async function verifyOtp(prisma, pendingId, otp) {
  const pending = await prisma.pendingRegistration.findUnique({
    where: { id: pendingId },
  });

  if (!pending) {
    return { success: false, error: 'Verification session not found. Please register again.' };
  }

  // Check if OTP has expired
  if (new Date() > pending.expiresAt) {
    return { success: false, error: 'Verification code has expired. Please request a new one.' };
  }

  // Check if max attempts exceeded
  if (pending.attempts >= MAX_ATTEMPTS) {
    return { success: false, error: 'Too many failed attempts. Please request a new code.' };
  }

  // Verify OTP hash
  const isValid = await bcrypt.compare(otp, pending.otpHash);

  if (!isValid) {
    // Increment attempt counter
    await prisma.pendingRegistration.update({
      where: { id: pendingId },
      data: { attempts: { increment: 1 } },
    });

    const remaining = MAX_ATTEMPTS - (pending.attempts + 1);
    return {
      success: false,
      error: remaining > 0
        ? `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        : 'Too many failed attempts. Please request a new code.',
    };
  }

  return { success: true, pending };
}

/**
 * Check if a resend is allowed (60-second cooldown).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} pendingId
 * @returns {Promise<{ allowed: boolean, retryAfter?: number, pending?: object }>}
 */
export async function canResendOtp(prisma, pendingId) {
  const pending = await prisma.pendingRegistration.findUnique({
    where: { id: pendingId },
  });

  if (!pending) {
    return { allowed: false, error: 'Verification session not found. Please register again.' };
  }

  const secondsSinceLastSend = Math.floor((Date.now() - pending.lastSentAt.getTime()) / 1000);
  if (secondsSinceLastSend < RESEND_COOLDOWN_SECONDS) {
    return {
      allowed: false,
      retryAfter: RESEND_COOLDOWN_SECONDS - secondsSinceLastSend,
    };
  }

  return { allowed: true, pending };
}

/**
 * Regenerate OTP for an existing pending registration.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} pendingId
 * @param {string} newOtp - The new plain OTP
 * @returns {Promise<object>} Updated pending registration
 */
export async function regenerateOtp(prisma, pendingId, newOtp) {
  const otpHash = await bcrypt.hash(newOtp, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  return prisma.pendingRegistration.update({
    where: { id: pendingId },
    data: {
      otpHash,
      expiresAt,
      attempts: 0,
      lastSentAt: new Date(),
    },
  });
}

/**
 * Delete a pending registration (after successful verification).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} pendingId
 */
export async function deletePendingRegistration(prisma, pendingId) {
  await prisma.pendingRegistration.delete({ where: { id: pendingId } });
}

/**
 * Clean up expired pending registrations (older than 24 hours).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @returns {Promise<number>} Number of records deleted
 */
export async function cleanupExpiredRegistrations(prisma) {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await prisma.pendingRegistration.deleteMany({
    where: { createdAt: { lt: cutoff } },
  });
  return result.count;
}

// ─── Password Reset OTP (Forgot Password flow) ──────────────
// Mirrors the pending-registration logic above, but targets the
// PasswordResetRequest table and is keyed by email (not an opaque id),
// so the forgot-password response shape never leaks account existence.

/**
 * Create (or replace) a password reset request with a hashed OTP.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} email - The account email (already known to exist)
 * @param {string} otp - The plain 6-digit OTP
 * @returns {Promise<{ id: string, email: string }>}
 */
export async function createPasswordResetRequest(prisma, email, otp) {
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  const request = await prisma.passwordResetRequest.upsert({
    where: { email },
    update: {
      otpHash,
      expiresAt,
      attempts: 0,
      lastSentAt: new Date(),
    },
    create: {
      email,
      otpHash,
      expiresAt,
      lastSentAt: new Date(),
    },
  });

  return { id: request.id, email: request.email };
}

/**
 * Verify a password reset OTP for a given email.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} email
 * @param {string} otp - The plain OTP to verify
 * @returns {Promise<{ success: boolean, error?: string, request?: object }>}
 */
export async function verifyPasswordResetOtp(prisma, email, otp) {
  const request = await prisma.passwordResetRequest.findUnique({
    where: { email },
  });

  // Generic message avoids leaking whether a reset was ever requested for this email.
  if (!request) {
    return { success: false, error: 'Invalid or expired reset code. Please request a new one.' };
  }

  if (new Date() > request.expiresAt) {
    return { success: false, error: 'Reset code has expired. Please request a new one.' };
  }

  if (request.attempts >= MAX_ATTEMPTS) {
    return { success: false, error: 'Too many failed attempts. Please request a new code.' };
  }

  const isValid = await bcrypt.compare(otp, request.otpHash);

  if (!isValid) {
    await prisma.passwordResetRequest.update({
      where: { email },
      data: { attempts: { increment: 1 } },
    });

    const remaining = MAX_ATTEMPTS - (request.attempts + 1);
    return {
      success: false,
      error: remaining > 0
        ? `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        : 'Too many failed attempts. Please request a new code.',
    };
  }

  return { success: true, request };
}

/**
 * Check if a password reset resend is allowed (60-second cooldown).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} email
 * @returns {Promise<{ allowed: boolean, retryAfter?: number, request?: object, error?: string }>}
 */
export async function canResendPasswordReset(prisma, email) {
  const request = await prisma.passwordResetRequest.findUnique({
    where: { email },
  });

  if (!request) {
    return { allowed: false, error: 'No reset in progress for this email. Please start again.' };
  }

  const secondsSinceLastSend = Math.floor((Date.now() - request.lastSentAt.getTime()) / 1000);
  if (secondsSinceLastSend < RESEND_COOLDOWN_SECONDS) {
    return {
      allowed: false,
      retryAfter: RESEND_COOLDOWN_SECONDS - secondsSinceLastSend,
    };
  }

  return { allowed: true, request };
}

/**
 * Regenerate the OTP for an existing password reset request.
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} email
 * @param {string} newOtp - The new plain OTP
 * @returns {Promise<object>}
 */
export async function regeneratePasswordResetOtp(prisma, email, newOtp) {
  const otpHash = await bcrypt.hash(newOtp, 10);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);

  return prisma.passwordResetRequest.update({
    where: { email },
    data: {
      otpHash,
      expiresAt,
      attempts: 0,
      lastSentAt: new Date(),
    },
  });
}

/**
 * Delete a password reset request (after successful reset).
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 * @param {string} email
 */
export async function deletePasswordResetRequest(prisma, email) {
  await prisma.passwordResetRequest.deleteMany({ where: { email } });
}
