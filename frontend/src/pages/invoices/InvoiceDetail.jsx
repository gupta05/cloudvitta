import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, X, IndianRupee } from 'lucide-react';
import api from '../../api/client';
import { formatCurrency } from '../../lib/currency';
import { toast } from 'sonner';

export default function InvoiceDetail() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchInvoice = () => api.getInvoice(id).then(setInvoice).finally(() => setLoading(false));
  useEffect(() => { fetchInvoice(); }, [id]);

  const handleAction = async (action) => {
    try {
      if (action === 'finalize') await api.finalizeInvoice(id);
      else if (action === 'pay') await api.markInvoicePaid(id);
      else if (action === 'void') await api.voidInvoice(id);
      toast.success(`Invoice ${action}ed!`);
      fetchInvoice();
    } catch (e) { toast.error(e.message); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-cv-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!invoice) return <div className="text-center py-20 text-cv-text-muted">Invoice not found</div>;

  const fmt = formatCurrency;

  return (
    <div className="max-w-3xl">
      <Link to="/invoices" className="inline-flex items-center gap-1.5 text-sm text-cv-text-secondary hover:text-cv-text mb-4"><ArrowLeft size={16} /> Back</Link>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-cv-text">{invoice.invoiceNumber}</h1>
          <p className="text-cv-text-secondary text-sm mt-1">{invoice.customer?.name} • {invoice.subscription?.planVersion?.plan?.name || 'Manual'}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge badge-${invoice.status.toLowerCase()}`}>{invoice.status}</span>
          {invoice.status === 'DRAFT' && <button className="btn btn-primary btn-sm" onClick={() => handleAction('finalize')}><Check size={14} /> Finalize</button>}
          {invoice.status === 'FINALIZED' && <button className="btn btn-primary btn-sm" onClick={() => handleAction('pay')}><IndianRupee size={14} /> Mark Paid</button>}
          {['DRAFT', 'FINALIZED'].includes(invoice.status) && <button className="btn btn-danger btn-sm" onClick={() => handleAction('void')}><X size={14} /> Void</button>}
        </div>
      </div>

      {/* Info */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="glass-card p-4"><p className="text-xs text-cv-text-muted">Period</p><p className="text-sm font-medium mt-1">{new Date(invoice.periodStart).toLocaleDateString()} — {new Date(invoice.periodEnd).toLocaleDateString()}</p></div>
        <div className="glass-card p-4"><p className="text-xs text-cv-text-muted">Issue Date</p><p className="text-sm font-medium mt-1">{new Date(invoice.issueDate).toLocaleDateString()}</p></div>
        <div className="glass-card p-4"><p className="text-xs text-cv-text-muted">Due Date</p><p className="text-sm font-medium mt-1">{new Date(invoice.dueDate).toLocaleDateString()}</p></div>
        <div className="glass-card p-4"><p className="text-xs text-cv-text-muted">Currency</p><p className="text-sm font-medium mt-1">{invoice.currency}</p></div>
      </div>

      {/* Line Items */}
      <div className="glass-card p-5 mb-6">
        <h3 className="text-sm font-semibold text-cv-text mb-4">Line Items</h3>
        <table className="data-table">
          <thead><tr><th>Description</th><th className="text-right">Qty</th><th className="text-right">Unit Price</th><th className="text-right">Total</th></tr></thead>
          <tbody>
            {invoice.lines?.map((line) => (
              <tr key={line.id}>
                <td><p className="font-medium">{line.name}</p><p className="text-xs text-cv-text-muted">{line.description}</p></td>
                <td className="text-right">{typeof line.quantity === 'number' ? line.quantity.toLocaleString() : line.quantity}</td>
                <td className="text-right font-mono text-sm">{fmt(line.unitPriceCents)}</td>
                <td className="text-right font-medium">{fmt(line.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="border-t border-cv-border mt-4 pt-4 space-y-2">
          <div className="flex justify-between text-sm"><span className="text-cv-text-secondary">Subtotal</span><span className="font-medium">{fmt(invoice.subtotalCents)}</span></div>
          {invoice.taxCents > 0 && <div className="flex justify-between text-sm"><span className="text-cv-text-secondary">Tax</span><span>{fmt(invoice.taxCents)}</span></div>}
          <div className="flex justify-between text-lg font-bold border-t border-cv-border pt-2"><span>Total</span><span className="gradient-text">{fmt(invoice.totalCents)}</span></div>
          {invoice.amountDueCents > 0 && invoice.status !== 'PAID' && (
            <div className="flex justify-between text-sm text-cv-danger"><span>Amount Due</span><span className="font-bold">{fmt(invoice.amountDueCents)}</span></div>
          )}
        </div>
      </div>

      {/* Credit Notes */}
      {invoice.creditNotes?.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-cv-text mb-3">Credit Notes</h3>
          {invoice.creditNotes.map((cn) => (
            <div key={cn.id} className="flex items-center justify-between py-2 border-b border-cv-border last:border-0">
              <div><span className="font-mono text-sm">{cn.creditNumber}</span><span className="ml-2 text-xs text-cv-text-muted">{cn.reason}</span></div>
              <div className="flex items-center gap-2"><span className={`badge badge-${cn.status.toLowerCase()}`}>{cn.status}</span><span className="font-medium text-cv-danger">-{fmt(cn.totalCents)}</span></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
