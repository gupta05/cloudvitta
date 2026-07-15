/**
 * Multi-tenant context middleware.
 * 
 * For admins/members: extracts tenantId from the x-tenant-id header.
 * For end-users: auto-sets tenantId from the JWT (no header needed).
 * 
 * Also provides customerScope middleware for data isolation.
 */

/**
 * Set req.tenantId from JWT or x-tenant-id header.
 */
export function tenantContext(req, res, next) {
  let tenantId;
  if (req.user?.role === 'user') {
    // End-users are pinned to their own tenant from the JWT — the x-tenant-id
    // header cannot override it (prevents a portal user from reaching another tenant).
    tenantId = req.user.tenantId;
  } else {
    // Admins/members choose the active tenant via the x-tenant-id header (the
    // AppLayout tenant switcher), falling back to their home tenant from the JWT.
    // validateTenantAccess (next in the chain) still enforces org membership.
    tenantId = req.headers['x-tenant-id'] || req.user?.tenantId;
  }
  if (!tenantId) {
    return res.status(400).json({ error: 'Missing x-tenant-id header' });
  }
  req.tenantId = tenantId;
  next();
}

/**
 * Validates that the tenant belongs to the user's organization.
 * Must be used AFTER authenticate and tenantContext.
 */
export async function validateTenantAccess(req, res, next) {
  try {
    const prisma = req.app.locals.prisma;
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.tenantId },
    });
    if (!tenant) {
      return res.status(404).json({ error: 'Tenant not found' });
    }
    if (tenant.organizationId !== req.user.organizationId) {
      return res.status(403).json({ error: 'Access denied to this tenant' });
    }
    req.tenant = tenant;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Customer scope middleware.
 * For end-users (role=user): auto-scopes to their customer.
 * For admins/members: optionally scopes via ?customerId query param.
 * 
 * Sets req.customerId (may be null for admins viewing all data).
 */
export function customerScope(req, res, next) {
  if (req.user?.role === 'user' && req.user?.customerId) {
    // End-users are always scoped to their own customer
    req.customerId = req.user.customerId;
  } else {
    // Admins can optionally filter by customer
    req.customerId = req.query.customerId || null;
  }
  next();
}
