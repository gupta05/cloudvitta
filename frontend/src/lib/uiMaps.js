// Shared UI mapping tables and small display helpers.
// Keeps status→badge classes, icon maps, and parsing logic in one place.

import { File, FileText, Image, Film, Archive } from 'lucide-react';

/** User role → badge class (admin user tables). */
export const ROLE_BADGES = {
  admin: 'badge-active',
  member: 'badge-finalized',
  user: 'badge-draft',
};

/** Payment status → badge class + display label. */
export const PAYMENT_BADGES = {
  CREATED: { class: 'badge-pending', label: 'Pending' },
  CAPTURED: { class: 'badge-captured', label: 'Successful' },
  FAILED: { class: 'badge-failed', label: 'Failed' },
  CANCELLED: { class: 'badge-cancelled', label: 'Cancelled' },
  REFUNDED: { class: 'badge-refunded', label: 'Refunded' },
};

/** Storage usage-event code → human label. */
export const EVENT_LABELS = {
  storage_put_ops: 'Upload',
  storage_get_ops: 'Download',
  storage_delete_ops: 'Delete',
};

/**
 * File content-type → { Icon, colorClass } for file listings.
 * Uses token classes so the palette stays in sync with the design system.
 */
export function getFileIcon(contentType) {
  if (contentType?.startsWith('image/')) return { Icon: Image, colorClass: 'text-cv-success' };
  if (contentType?.startsWith('video/')) return { Icon: Film, colorClass: 'text-cv-danger' };
  if (contentType?.startsWith('text/')) return { Icon: FileText, colorClass: 'text-cv-primary' };
  if (contentType?.includes('zip') || contentType?.includes('tar') || contentType?.includes('gzip') || contentType?.includes('compressed')) {
    return { Icon: Archive, colorClass: 'text-cv-warning' };
  }
  return { Icon: File, colorClass: 'text-cv-text-muted' };
}

/** User-agent string → short browser/platform label for session lists. */
export function parseUA(ua) {
  if (!ua) return 'Unknown device';
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome/')) return 'Chrome';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/')) return 'Safari';
  return 'Browser';
}
