import { Router } from 'express';
import { authenticate, requireAdminOrMember } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess } from '../middleware/tenantContext.js';

const router = Router();
router.use(authenticate, tenantContext, validateTenantAccess, requireAdminOrMember);

// GET /api/credit-notes
router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { invoiceId } = req.query;
    const notes = await prisma.creditNote.findMany({
      where: { tenantId: req.tenantId, ...(invoiceId && { invoiceId }) },
      include: { invoice: { select: { id: true, invoiceNumber: true, totalCents: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: notes });
  } catch (err) { next(err); }
});

// POST /api/credit-notes
router.post('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { invoiceId, reason, totalCents } = req.body;
    if (!invoiceId || !totalCents) return res.status(400).json({ error: 'invoiceId and totalCents are required' });

    const invoice = await prisma.invoice.findFirst({ where: { id: invoiceId, tenantId: req.tenantId } });
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    if (totalCents > invoice.totalCents) return res.status(400).json({ error: 'Credit note cannot exceed invoice total' });

    const count = await prisma.creditNote.count({ where: { tenantId: req.tenantId } });
    const creditNumber = `CN-${String(count + 1).padStart(5, '0')}`;

    const note = await prisma.creditNote.create({
      data: { tenantId: req.tenantId, invoiceId, creditNumber, reason: reason || '', totalCents, status: 'DRAFT' },
    });
    res.status(201).json(note);
  } catch (err) { next(err); }
});

// POST /api/credit-notes/:id/finalize
router.post('/:id/finalize', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const existing = await prisma.creditNote.findFirst({ where: { id: req.params.id, tenantId: req.tenantId } });
    if (!existing) return res.status(404).json({ error: 'Credit note not found' });
    const note = await prisma.creditNote.update({ where: { id: req.params.id }, data: { status: 'FINALIZED' } });
    res.json(note);
  } catch (err) { next(err); }
});

export default router;
