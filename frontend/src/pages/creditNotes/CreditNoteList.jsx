import { useEffect, useState } from 'react';
import { Receipt, Plus } from 'lucide-react';
import api from '../../api/client';
import { formatCurrency } from '../../lib/currency';
import { formatDate } from '../../lib/format';
import { toast } from 'sonner';
import ErrorBanner from '../../components/ui/ErrorBanner';
import Modal from '../../components/ui/Modal';
import { TableSkeleton } from '../../components/ui/Skeleton';

export default function CreditNoteList() {
  const [notes, setNotes] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ invoiceId: '', reason: '', totalCents: '' });
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  const fetchData = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.getCreditNotes(),
      api.getInvoices('perPage=100'),
    ]).then(([n, inv]) => {
      setNotes(n.data);
      setInvoices(inv.data);
    }).catch((err) => setError(err.message || 'Failed to load credit notes'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchData(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await api.createCreditNote({ ...form, totalCents: Math.round(parseFloat(form.totalCents) * 100) });
      toast.success('Credit note created');
      setShowModal(false); setForm({ invoiceId: '', reason: '', totalCents: '' });
      api.getCreditNotes().then((d) => setNotes(d.data));
    } catch (err) { toast.error(err.message); }
    finally { setCreating(false); }
  };

  const fmt = formatCurrency;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-cv-text">Credit Notes</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> New Credit Note</button>
      </div>
      <div className="glass-card overflow-hidden">
        {error ? (
          <ErrorBanner message={error} onRetry={fetchData} />
        ) : (
        <table className="data-table">
          <thead><tr><th>Credit #</th><th>Invoice</th><th>Reason</th><th>Status</th><th>Amount</th><th>Date</th></tr></thead>
          {loading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : (
            <tbody>
              {notes.length === 0 ? <tr><td colSpan="6" className="text-center py-10"><Receipt size={32} className="mx-auto mb-2 opacity-30 text-cv-text-muted" /><p className="text-cv-text-muted">No credit notes</p></td></tr> :
                notes.map((n) => (
                  <tr key={n.id}>
                    <td className="font-mono text-sm font-medium">{n.creditNumber}</td>
                    <td className="font-mono text-xs">{n.invoice?.invoiceNumber}</td>
                    <td className="text-cv-text-secondary text-sm">{n.reason || '—'}</td>
                    <td><span className={`badge badge-${n.status.toLowerCase()}`}>{n.status}</span></td>
                    <td className="font-medium text-cv-danger">{fmt(n.totalCents)}</td>
                    <td className="text-cv-text-secondary">{formatDate(n.createdAt)}</td>
                  </tr>
                ))}
            </tbody>
          )}
        </table>
        )}
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="New Credit Note"
        footer={
          <>
            <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
              {creating && <span className="btn-spinner" />}
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          </>
        }
      >
        <div className="space-y-3">
          <div><label className="form-label" htmlFor="cn-invoice">Invoice</label>
            <select id="cn-invoice" className="form-input" value={form.invoiceId} onChange={(e) => setForm({ ...form, invoiceId: e.target.value })}>
              <option value="">Select...</option>
              {invoices.map((i) => <option key={i.id} value={i.id}>{i.invoiceNumber} — {fmt(i.totalCents)}</option>)}
            </select>
          </div>
          <div><label className="form-label" htmlFor="cn-amount">Amount (₹)</label><input id="cn-amount" type="number" step="0.01" className="form-input" value={form.totalCents} onChange={(e) => setForm({ ...form, totalCents: e.target.value })} /></div>
          <div><label className="form-label" htmlFor="cn-reason">Reason</label><input id="cn-reason" className="form-input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
        </div>
      </Modal>
    </div>
  );
}
