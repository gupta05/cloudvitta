import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Shared modal dialog. Renders nothing when `open` is false.
 * - Esc and backdrop click close (unless dismissable={false})
 * - role="dialog" + aria-modal; focus moves in on open and restores on close
 * - Standard width max-w-md; override with `width` (a max-w-* class)
 */
export default function Modal({ open, onClose, title, children, footer, width = 'max-w-md', dismissable = true, zIndex = 'z-50' }) {
  const panelRef = useRef(null);
  const previousFocus = useRef(null);

  useEffect(() => {
    if (!open) return;
    previousFocus.current = document.activeElement;
    // Move focus into the dialog
    panelRef.current?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape' && dismissable) onClose?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previousFocus.current?.focus?.();
    };
  }, [open, dismissable, onClose]);

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 bg-black/60 flex items-center justify-center ${zIndex} p-4 animate-fade-in`}
      onClick={dismissable ? onClose : undefined}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={`glass-card p-6 w-full ${width} outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-cv-text">{title}</h3>
            {dismissable && (
              <button onClick={onClose} className="icon-btn" aria-label="Close dialog">
                <X size={16} />
              </button>
            )}
          </div>
        )}
        {children}
        {footer && <div className="flex items-center justify-end gap-2 mt-6">{footer}</div>}
      </div>
    </div>
  );
}
