import { Router } from 'express';
import { authenticate, requireAdminOrMember } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess } from '../middleware/tenantContext.js';
import { parsePagination, paginatedResponse } from '../utils/pagination.js';

const router = Router();
router.use(authenticate, tenantContext, validateTenantAccess, requireAdminOrMember);

// GET /api/customers — list with search and pagination
router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const pag = parsePagination(req.query);
    const search = req.query.search || '';

    const where = {
      tenantId: req.tenantId,
      ...(search && {
        OR: [
          { name: { contains: search } },
          { email: { contains: search } },
          { alias: { contains: search } },
        ],
      }),
    };

    const [data, totalCount] = await Promise.all([
      prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pag.skip,
        take: pag.take,
        include: {
          _count: { select: { subscriptions: true, invoices: true } },
        },
      }),
      prisma.customer.count({ where }),
    ]);

    res.json(paginatedResponse(data, totalCount, pag));
  } catch (err) { next(err); }
});

// GET /api/customers/:id
router.get('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
      include: {
        subscriptions: {
          include: { planVersion: { include: { plan: true } } },
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
        invoices: { orderBy: { createdAt: 'desc' }, take: 10 },
        _count: { select: { subscriptions: true, invoices: true, usageEvents: true } },
      },
    });
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json(customer);
  } catch (err) { next(err); }
});

// POST /api/customers
router.post('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { name, alias, email, phone, currency, billingAddress, shippingAddress } = req.body;
    if (!name) return res.status(400).json({ error: 'name is required' });

    const customer = await prisma.customer.create({
      data: {
        tenantId: req.tenantId,
        name,
        alias: alias || null,
        email: email || null,
        phone: phone || null,
        currency: currency || req.tenant.currency,
        billingAddress: billingAddress ? JSON.stringify(billingAddress) : '',
        shippingAddress: shippingAddress ? JSON.stringify(shippingAddress) : '',
      },
    });
    res.status(201).json(customer);
  } catch (err) { next(err); }
});

// PUT /api/customers/:id
router.put('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { name, alias, email, phone, currency, billingAddress, shippingAddress } = req.body;

    // Tenant-scoped lookup prevents cross-tenant mutation
    const existing = await prisma.customer.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Customer not found' });

    const customer = await prisma.customer.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(alias !== undefined && { alias: alias || null }),
        ...(email !== undefined && { email: email || null }),
        ...(phone !== undefined && { phone: phone || null }),
        ...(currency && { currency }),
        ...(billingAddress && { billingAddress: JSON.stringify(billingAddress) }),
        ...(shippingAddress && { shippingAddress: JSON.stringify(shippingAddress) }),
      },
    });
    res.json(customer);
  } catch (err) { next(err); }
});

// DELETE /api/customers/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    // Tenant-scoped lookup prevents cross-tenant deletion
    const existing = await prisma.customer.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Customer not found' });

    // Check no active subscriptions
    const activeSubs = await prisma.subscription.count({
      where: { customerId: req.params.id, status: { in: ['ACTIVE', 'TRIAL', 'PENDING'] } },
    });
    if (activeSubs > 0) {
      return res.status(409).json({ error: 'Cannot delete customer with active subscriptions' });
    }
    await prisma.customer.delete({ where: { id: req.params.id } });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
