/**
 * CloudVitta Webhook Dispatcher
 * Equivalent to Meteroid's Svix integration
 *
 * Dispatches events to registered webhook endpoints with:
 * - HMAC-SHA256 signature verification
 * - Retry logic with exponential backoff
 */

import crypto from 'crypto';

/**
 * Dispatch a webhook event to all matching endpoints.
 * @param {PrismaClient} prisma
 * @param {string} tenantId
 * @param {string} eventType - e.g., "invoice.created", "subscription.activated"
 * @param {object} payload - event data
 */
export async function dispatchWebhook(prisma, tenantId, eventType, payload) {
  const endpoints = await prisma.webhookEndpoint.findMany({
    where: { tenantId, isActive: true },
  });

  const matchingEndpoints = endpoints.filter((ep) => {
    const events = JSON.parse(ep.events || '[]');
    return events.includes('*') || events.includes(eventType);
  });

  const results = [];
  for (const endpoint of matchingEndpoints) {
    try {
      await deliverWebhook(endpoint, eventType, payload);
      results.push({ endpointId: endpoint.id, url: endpoint.url, status: 'delivered' });
    } catch (err) {
      results.push({ endpointId: endpoint.id, url: endpoint.url, status: 'failed', error: err.message });
    }
  }

  return results;
}

/**
 * Deliver a webhook to a single endpoint with retries.
 */
async function deliverWebhook(endpoint, eventType, payload, retries = 3) {
  const body = JSON.stringify({
    id: `evt_${crypto.randomUUID()}`,
    type: eventType,
    timestamp: new Date().toISOString(),
    data: payload,
  });

  const signature = crypto
    .createHmac('sha256', endpoint.secret)
    .update(body)
    .digest('hex');

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CloudVitta-Signature': `sha256=${signature}`,
          'X-CloudVitta-Event': eventType,
        },
        body,
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      if (response.ok) return;
      if (attempt === retries) throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      if (attempt === retries) throw err;
      // Exponential backoff: 1s, 2s, 4s
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt - 1)));
    }
  }
}
