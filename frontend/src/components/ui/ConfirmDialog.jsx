import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from './Modal';

/**
 * Styled confirmation dialog replacing native confirm().
 * onConfirm may be async — the confirm button shows a busy state while it runs.
 */
export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
}) {
  const [busy, setBusy] = useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm?.();
      onClose?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="flex items-start gap-3">
        {danger && (
          <div className="w-9 h-9 rounded-lg bg-cv-danger/10 border border-cv-danger/30 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} className="text-cv-danger" />
          </div>
        )}
        <p className="text-sm text-cv-text-secondary leading-relaxed">{message}</p>
      </div>
      <div className="flex items-center justify-end gap-2 mt-6">
        <button onClick={onClose} className="btn btn-secondary" disabled={busy}>{cancelLabel}</button>
        <button onClick={handleConfirm} className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>
          {busy && <span className="btn-spinner" />}
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
