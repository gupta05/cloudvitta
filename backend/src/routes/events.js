import { Router } from 'express';
import { authenticate, requireAdminOrMember } from '../middleware/auth.js';
import { tenantContext, validateTenantAccess } from '../middleware/tenantContext.js';
import { parsePagination, paginatedResponse } from '../utils/pagination.js';
import { aggregateUsage } from '../services/metering.js';

const router = Router();
router.use(authenticate, tenantContext, validateTenantAccess, requireAdminOrMember);

// POST /api/events/ingest — ingest usage events (batch)
router.post('/ingest', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { events } = req.body;
    if (!events || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ error: 'events array is required' });
    }

    const created = await prisma.usageEvent.createMany({
      data: events.map((e) => ({
        tenantId: req.tenantId,
        customerId: e.customerId,
        eventCode: e.eventCode,
        timestamp: e.timestamp ? new Date(e.timestamp) : new Date(),
        properties: JSON.stringify(e.properties || {}),
      })),
    });

    res.status(201).json({ ingested: created.count });
  } catch (err) { next(err); }
});

// GET /api/events — list events
router.get('/', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const pag = parsePagination(req.query);
    const { customerId, eventCode } = req.query;

    const where = {
      tenantId: req.tenantId,
      ...(customerId && { customerId }),
      ...(eventCode && { eventCode }),
    };

    const [data, totalCount] = await Promise.all([
      prisma.usageEvent.findMany({
        where,
        include: { customer: { select: { id: true, name: true } } },
        orderBy: { timestamp: 'desc' },
        skip: pag.skip,
        take: pag.take,
      }),
      prisma.usageEvent.count({ where }),
    ]);

    // Parse properties JSON for each event
    const parsed = data.map((e) => ({ ...e, properties: JSON.parse(e.properties || '{}') }));
    res.json(paginatedResponse(parsed, totalCount, pag));
  } catch (err) { next(err); }
});

// GET /api/events/usage — aggregate usage for a customer + metric over a period
router.get('/usage', async (req, res, next) => {
  try {
    const prisma = req.app.locals.prisma;
    const { customerId, metricCode, periodStart, periodEnd } = req.query;
    if (!customerId || !metricCode) {
      return res.status(400).json({ error: 'customerId and metricCode are required' });
    }
    const result = await aggregateUsage(
      prisma, req.tenantId, customerId, metricCode,
      periodStart ? new Date(periodStart) : new Date(Date.now() - 30 * 86400000),
      periodEnd ? new Date(periodEnd) : new Date()
    );
    res.json(result);
  } catch (err) { next(err); }
});

export default router;
