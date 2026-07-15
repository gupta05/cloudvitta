import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, Printer } from 'lucide-react';
import api from '../../api/client';
import ErrorBanner from '../../components/ui/ErrorBanner';
import { formatCurrency } from '../../lib/currency';

export default function CustomerInvoiceDetail() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getPortalInvoice(id);
      setInvoice(data);
    } catch (err) {
      setError(err.message || 'Failed to load invoice');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [id]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-cv-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <ErrorBanner message={error} onRetry={fetchData} />;
  if (!invoice) return <ErrorBanner message="Invoice not found" />;

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link to="/portal/billing" className="p-2 rounded-lg hover:bg-cv-surface-2 text-cv-text-muted hover:text-cv-text transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <FileText size={20} className="text-cv-accent" />
              <h1 className="text-2xl font-bold text-cv-text">{invoice.invoiceNumber}</h1>
              <span className={`badge badge-${invoice.status.toLowerCase()}`}>{invoice.status}</span>
            </div>
            <p className="text-cv-text-secondary text-sm mt-0.5">
              {new Date(invoice.periodStart).toLocaleDateString()} — {new Date(invoice.periodEnd).toLocaleDateString()}
            </p>
          </div>
        </div>
        <button onClick={() => window.print()} className="btn btn-secondary">
          <Printer size={16} /> Print
        </button>
      </div>

      {/* Invoice Card */}
      <div className="glass-card p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 pb-6 border-b border-cv-border">
          <div>
            <p className="text-xs text-cv-text-muted uppercase font-semibold">Issue Date</p>
            <p className="text-sm text-cv-text mt-1">{new Date(invoice.issueDate).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-xs text-cv-text-muted uppercase font-semibold">Due Date</p>
            <p className="text-sm text-cv-text mt-1">{new Date(invoice.dueDate).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-xs text-cv-text-muted uppercase font-semibold">Plan</p>
            <p className="text-sm text-cv-text mt-1">{invoice.subscription?.planVersion?.plan?.name || 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-cv-text-muted uppercase font-semibold">Status</p>
            <p className="text-sm text-cv-text mt-1">{invoice.paidAt ? `Paid ${new Date(invoice.paidAt).toLocaleDateString()}` : invoice.status}</p>
          </div>
        </div>

        {/* Line Items */}
        <h3 className="text-sm font-semibold text-cv-text mb-3">Line Items</h3>
        <table className="data-table mb-6">
          <thead>
            <tr>
              <th>Description</th>
              <th className="text-right">Qty</th>
              <th className="text-right">Unit Price</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.lines || []).map((line) => (
              <tr key={line.id}>
                <td>
                  <p className="font-medium">{line.name}</p>
                  {line.description && <p className="text-xs text-cv-text-muted mt-0.5">{line.description}</p>}
                </td>
                <td className="text-right font-mono text-cv-text-secondary">{line.quantity}</td>
                <td className="text-right font-mono text-cv-text-secondary">{formatCurrency(line.unitPriceCents)}</td>
                <td className="text-right font-mono font-medium">{formatCurrency(line.totalCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-64 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-cv-text-secondary">Subtotal</span>
              <span className="font-mono text-cv-text">{formatCurrency(invoice.subtotalCents)}</span>
            </div>
            {invoice.taxCents > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-cv-text-secondary">Tax</span>
                <span className="font-mono text-cv-text">{formatCurrency(invoice.taxCents)}</span>
              </div>
            )}
            <div className="flex items-center justify-between text-sm pt-2 border-t border-cv-border">
              <span className="font-semibold text-cv-text">Total</span>
              <span className="font-mono font-bold text-cv-accent text-lg">{formatCurrency(invoice.totalCents)}</span>
            </div>
            {invoice.amountDueCents > 0 && invoice.status !== 'PAID' && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-cv-text-secondary">Amount Due</span>
                <span className="font-mono font-bold text-cv-danger">{formatCurrency(invoice.amountDueCents)}</span>
              </div>
            )}
          </div>
        </div>

        {invoice.notes && (
          <div className="mt-6 pt-4 border-t border-cv-border">
            <p className="text-xs text-cv-text-muted">{invoice.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
