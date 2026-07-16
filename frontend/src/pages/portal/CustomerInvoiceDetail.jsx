import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, FileText, Printer, IndianRupee, Gauge } from 'lucide-react';
import api from '../../api/client';
import ErrorBanner from '../../components/ui/ErrorBanner';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import { formatCurrency, formatRupees } from '../../lib/currency';
import { formatDate } from '../../lib/format';
import { loadRazorpayScript } from '../../lib/razorpay';
import { toast } from 'sonner';

export default function CustomerInvoiceDetail() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [verifying, setVerifying] = useState(false);
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

  // Pay this invoice via Razorpay checkout (metered arrears invoices).
  const payInvoice = async () => {
    setPaying(true);
    try {
      const order = await api.createPaymentOrder({ purpose: 'invoice_payment', invoiceId: invoice.id });
      await loadRazorpayScript();

      const rzp = new window.Razorpay({
        key: order.keyId,
        amount: order.amountCents, // already in paise — never multiply
        currency: order.currency,
        name: 'CloudVitta',
        description: `Invoice ${invoice.invoiceNumber} — usage charges`,
        order_id: order.orderId,
        prefill: order.prefill,
        theme: { color: '#3b82f6' },
        modal: {
          ondismiss: () => {
            api.reportPaymentFailure({ razorpay_order_id: order.orderId, cancelled: true }).catch(() => {});
            toast.info('Payment cancelled — you have not been charged');
          },
        },
        handler: async (resp) => {
          setVerifying(true);
          try {
            await api.verifyPayment({
              razorpay_order_id: resp.razorpay_order_id,
              razorpay_payment_id: resp.razorpay_payment_id,
              razorpay_signature: resp.razorpay_signature,
            });
            toast.success(`Invoice ${invoice.invoiceNumber} paid!`);
          } catch (err) {
            toast.error(`Payment received but verification failed: ${err.message}. Reference: ${resp.razorpay_payment_id} — it will be confirmed automatically.`);
          } finally {
            setVerifying(false);
            fetchData();
          }
        },
      });

      rzp.on('payment.failed', (resp) => {
        api.reportPaymentFailure({
          razorpay_order_id: order.orderId,
          code: resp.error?.code || null,
          description: resp.error?.description || null,
        }).catch(() => {});
        toast.error(resp.error?.description || 'Payment failed. Please try again.');
      });

      rzp.open();
    } catch (err) { toast.error(err.message); }
    finally { setPaying(false); }
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} onRetry={fetchData} />;
  if (!invoice) return <ErrorBanner message="Invoice not found" />;

  const isPayable = ['FINALIZED', 'OVERDUE'].includes(invoice.status) && invoice.amountDueCents > 0;

  // Metered line metadata (pricing transparency): the metered_gb_month line
  // carries avgGB / gbHours / rate / cap in its metadata JSON.
  const meteredMeta = (invoice.lines || []).map((line) => {
    try { return JSON.parse(line.metadata || '{}'); } catch { return {}; }
  }).find((m) => m.model === 'metered_gb_month') || null;

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <Link to="/portal/billing" className="icon-btn" aria-label="Back to billing">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <FileText size={20} className="text-cv-accent" />
              <h1 className="text-2xl font-bold text-cv-text">{invoice.invoiceNumber}</h1>
              <span className={`badge badge-${invoice.status.toLowerCase()}`}>{invoice.status}</span>
            </div>
            <p className="text-cv-text-secondary text-sm mt-1">
              {formatDate(invoice.periodStart)} — {formatDate(invoice.periodEnd)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isPayable && (
            <button onClick={payInvoice} className="btn btn-primary" disabled={paying}>
              {paying && <span className="btn-spinner" />}
              <IndianRupee size={16} /> {paying ? 'Processing...' : `Pay ${formatCurrency(invoice.amountDueCents)}`}
            </button>
          )}
          <button onClick={() => window.print()} className="btn btn-secondary">
            <Printer size={16} /> Print
          </button>
        </div>
      </div>

      {/* Overdue banner */}
      {invoice.status === 'OVERDUE' && (
        <div className="p-4 rounded-lg bg-cv-danger/10 border border-cv-danger/30 mb-6" role="alert">
          <p className="text-sm text-cv-danger">
            This invoice is overdue (due {formatDate(invoice.dueDate)}). New uploads are blocked until it is paid — your stored files remain accessible.
          </p>
        </div>
      )}

      {/* Metered usage calculation (pricing transparency) */}
      {meteredMeta && (
        <div className="glass-card p-5 mb-6">
          <h3 className="text-sm font-semibold text-cv-text mb-3 flex items-center gap-2">
            <Gauge size={16} className="text-cv-accent" /> Usage Calculation
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
            <div>
              <p className="text-xs text-cv-text-muted uppercase font-semibold">Average Storage</p>
              <p className="text-sm font-mono text-cv-text mt-1">{(meteredMeta.billedGB ?? meteredMeta.avgGB ?? 0).toFixed(4)} GB</p>
            </div>
            {meteredMeta.gbHours != null && (
              <div>
                <p className="text-xs text-cv-text-muted uppercase font-semibold">GB-Hours</p>
                <p className="text-sm font-mono text-cv-text mt-1">{meteredMeta.gbHours}</p>
              </div>
            )}
            {meteredMeta.peakGB != null && (
              <div>
                <p className="text-xs text-cv-text-muted uppercase font-semibold">Peak Storage</p>
                <p className="text-sm font-mono text-cv-text mt-1">{meteredMeta.peakGB} GB</p>
              </div>
            )}
            <div>
              <p className="text-xs text-cv-text-muted uppercase font-semibold">Rate</p>
              <p className="text-sm font-mono text-cv-text mt-1">{formatRupees(meteredMeta.pricePerGBMonth || 0)}/GB-month</p>
            </div>
          </div>
          <p className="text-xs text-cv-text-muted">
            Billed on the time-weighted average storage measured over the billing period
            {meteredMeta.snapshotCount != null && ` (${meteredMeta.snapshotCount} measurements)`}
            {meteredMeta.hardCapGB != null && `, capped at ${meteredMeta.hardCapGB} GB`}.
            {' '}Formula: average GB × {formatRupees(meteredMeta.pricePerGBMonth || 0)}/GB-month.
          </p>
        </div>
      )}

      {/* Invoice Card */}
      <div className="glass-card p-6 mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 pb-6 border-b border-cv-border">
          <div>
            <p className="text-xs text-cv-text-muted uppercase font-semibold">Issue Date</p>
            <p className="text-sm text-cv-text mt-1">{formatDate(invoice.issueDate)}</p>
          </div>
          <div>
            <p className="text-xs text-cv-text-muted uppercase font-semibold">Due Date</p>
            <p className="text-sm text-cv-text mt-1">{formatDate(invoice.dueDate)}</p>
          </div>
          <div>
            <p className="text-xs text-cv-text-muted uppercase font-semibold">Plan</p>
            <p className="text-sm text-cv-text mt-1">{invoice.subscription?.planVersion?.plan?.name || 'N/A'}</p>
          </div>
          <div>
            <p className="text-xs text-cv-text-muted uppercase font-semibold">Status</p>
            <p className="text-sm text-cv-text mt-1">{invoice.paidAt ? `Paid ${formatDate(invoice.paidAt)}` : invoice.status}</p>
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

      {/* Payment Verifying Overlay */}
      {verifying && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4" role="dialog" aria-modal="true" aria-label="Verifying payment">
          <div className="glass-card p-8 text-center max-w-sm">
            <div className="w-10 h-10 border-2 border-cv-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h3 className="text-lg font-bold text-cv-text mb-1">Verifying payment…</h3>
            <p className="text-sm text-cv-text-muted">Please do not close this window.</p>
          </div>
        </div>
      )}
    </div>
  );
}
