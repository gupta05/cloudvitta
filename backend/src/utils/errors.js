/**
 * Custom API error class with status code.
 */
export class ApiError extends Error {
  constructor(statusCode, message, details = null) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Global Express error handler.
 * Security: never leaks internal error details to clients.
 */
export function errorHandler(err, _req, res, _next) {
  // Log full stack in dev, condensed in production
  if (isDev) {
    console.error('[ERROR]', err.stack || err.message);
  } else {
    console.error('[ERROR]', err.message, err.stack?.split('\n').slice(0, 3).join(' <- '));
  }

  // JSON parse errors (malformed request body)
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      error: err.message,
      ...(err.details && { details: err.details }),
    });
  }

  // Prisma known errors
  if (err.code === 'P2002') {
    return res.status(409).json({ error: 'A record with that unique value already exists', field: err.meta?.target });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ error: 'Record not found' });
  }
  if (err.code === 'P2003') {
    return res.status(409).json({ error: 'Cannot complete operation due to related records' });
  }

  res.status(500).json({ error: 'Internal server error' });
}
