import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Authentication will fail.');
}

/**
 * JWT Authentication middleware.
 * Extracts user from Bearer token, validates the session is still active,
 * and attaches user info to req.user.
 *
 * Security: fails closed on DB errors and rejects tokens without sessionId.
 */
export function authenticate(req, res, next) {
  if (!JWT_SECRET) {
    return res.status(500).json({ error: 'Authentication service unavailable' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { userId, email, organizationId, sessionId, ... }

    // All current tokens include sessionId — reject tokens without one
    if (!decoded.sessionId) {
      return res.status(401).json({ error: 'Invalid token — please log in again' });
    }

    // Validate session is still active
    const prisma = req.app.locals.prisma;
    prisma.userSession.findUnique({
      where: { id: decoded.sessionId },
    }).then((session) => {
      if (!session || !session.isActive || new Date(session.expiresAt) < new Date()) {
        return res.status(401).json({ error: 'Session expired or revoked' });
      }
      // Update last active timestamp (fire-and-forget)
      prisma.userSession.update({
        where: { id: decoded.sessionId },
        data: { lastActiveAt: new Date() },
      }).catch(() => {});
      next();
    }).catch((err) => {
      // Fail closed: DB errors must not silently allow unauthenticated access
      console.error('[Auth] Session validation DB error:', err.message);
      return res.status(401).json({ error: 'Session validation failed' });
    });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Generate a JWT token for a user.
 * @param {object} user - The user object from Prisma
 * @param {string} [sessionId] - The session ID to embed in the token
 */
export function generateToken(user, sessionId = null) {
  const payload = {
    userId: user.id,
    email: user.email,
    organizationId: user.organizationId,
    role: user.role,
    customerId: user.customerId || null,
    tenantId: user.tenantId || null,
  };
  if (sessionId) payload.sessionId = sessionId;
  return jwt.sign(payload, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRY || '7d' });
}

/**
 * Require admin role.
 */
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/**
 * Require admin or member role.
 */
export function requireAdminOrMember(req, res, next) {
  if (req.user?.role !== 'admin' && req.user?.role !== 'member') {
    return res.status(403).json({ error: 'Admin or member access required' });
  }
  next();
}

/**
 * Require end-user role (customer portal access).
 * Ensures the caller is a customer-linked user, not an admin.
 */
export function requireUser(req, res, next) {
  if (req.user?.role !== 'user' || !req.user?.customerId) {
    return res.status(403).json({ error: 'Customer account required' });
  }
  req.customerId = req.user.customerId;
  next();
}
