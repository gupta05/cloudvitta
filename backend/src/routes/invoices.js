import { Router } from 'express';
import { authenticate, requireAdminOrMember } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess } from '../middleware/tenantContext.js';
import { parsePagination, paginatedResponse } from '../utils/pagination.js';
import { generateInvoiceForSubscription } from '../services/billing.js';
import { recordTransaction, TXN } from '../services/ledger.js';

const router = Router();
router.use(authenticate, tenantContext, validateTenantAccess, requireAdminOrMember);

// GET /api/invoices
router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const pag = parsePagination(req.query);
    const { status, customerId } = req.query;

    const where = {
      tenantId: req.tenantId,
      ...(status && { status }),
      ...(customerId && { customerId }),
    };

    const [data, totalCount] = await Promise.all([
      prisma.invoice.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, email: true } },
          subscription: { include: { planVersion: { include: { plan: { select: { name: true } } } } } },
          _count: { select: { lines: true, creditNotes: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: pag.skip,
        take: pag.take,
      }),
      prisma.invoice.count({ where }),
    ]);

    res.json(paginatedResponse(data, totalCount, pag));
  } catch (err) { next(err); }
});

// GET /api/invoices/:id
router.get('/:id', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, tenantId: req.tenantId },
      include: {
        customer: true,
        subscription: { include: { planVersion: { include: { plan: true } } } },
        lines: { orderBy: { createdAt: 'asc' } },
        creditNotes: true,
      },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.json(invoice);
  } catch (err) { next(err); }
});

// POST /api/invoices/generate/:subscriptionId — generate invoice for a subscription
router.post('/generate/:subscriptionId', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { periodStart, periodEnd } = req.body || {};
    const invoice = await generateInvoiceForSubscription(
      prisma,
      req.params.subscriptionId,
      req.tenantId,
      periodStart ? new Date(periodStart) : undefined,
      periodEnd ? new Date(periodEnd) : undefined
    );
    res.status(201).json(invoice);
  } catch (err) { next(err); }
});

// POST /api/invoices/:id/finalize
router.post('/:id/finalize', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const existing = await prisma.invoice.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status: 'FINALIZED' },
    });
    res.json(invoice);
  } catch (err) { next(err); }
});

// POST /api/invoices/:id/mark-paid
router.post('/:id/mark-paid', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const existing = await prisma.invoice.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status: 'PAID', paidAt: new Date(), amountDueCents: 0 },
    });
    recordTransaction(prisma, {
      tenantId: invoice.tenantId,
      customerId: invoice.customerId,
      type: TXN.INVOICE_PAID,
      description: `Invoice ${invoice.invoiceNumber} marked paid by admin`,
      invoiceId: invoice.id,
      subscriptionId: invoice.subscriptionId,
      idempotencyKey: `${invoice.id}:PAID`,
    }).catch(() => {});
    res.json(invoice);
  } catch (err) { next(err); }
});

// POST /api/invoices/:id/void
router.post('/:id/void', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const existing = await prisma.invoice.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: { status: 'VOID', voidedAt: new Date() },
    });
    res.json(invoice);
  } catch (err) { next(err); }
});

export default router;
