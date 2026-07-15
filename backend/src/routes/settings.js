import { Router } from 'express';
import { authenticate, requireAdminOrMember } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess } from '../middleware/tenantContext.js';

const router = Router();
router.use(authenticate, tenantContext, validateTenantAccess, requireAdminOrMember);

// GET /api/settings/invoicing-entity
router.get('/invoicing-entity', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    let entity = await prisma.invoicingEntity.findUnique({ where: { tenantId: req.tenantId } });
    if (!entity) {
      entity = await prisma.invoicingEntity.create({ data: { tenantId: req.tenantId } });
    }
    res.json(entity);
  } catch (err) { next(err); }
});

// PUT /api/settings/invoicing-entity
router.put('/invoicing-entity', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { legalName, taxId, addressLine1, addressLine2, city, state, zipCode, country, logoUrl, footerNote } = req.body;

    const entity = await prisma.invoicingEntity.upsert({
      where: { tenantId: req.tenantId },
      update: {
        ...(legalName !== undefined && { legalName }),
        ...(taxId !== undefined && { taxId }),
        ...(addressLine1 !== undefined && { addressLine1 }),
        ...(addressLine2 !== undefined && { addressLine2 }),
        ...(city !== undefined && { city }),
        ...(state !== undefined && { state }),
        ...(zipCode !== undefined && { zipCode }),
        ...(country !== undefined && { country }),
        ...(logoUrl !== undefined && { logoUrl }),
        ...(footerNote !== undefined && { footerNote }),
      },
      create: {
        tenantId: req.tenantId, legalName, taxId, addressLine1, addressLine2,
        city, state, zipCode, country, logoUrl, footerNote,
      },
    });
    res.json(entity);
  } catch (err) { next(err); }
});

export default router;
