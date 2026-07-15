import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Play, XCircle, FileText, Puzzle } from 'lucide-react';
import api from '../../api/client';
import { formatCurrency } from '../../lib/currency';
import { toast } from 'sonner';

export default function SubscriptionDetail() {
  const { id } = useParams();
  const [sub, setSub] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchSub = () => api.getSubscription(id).then(setSub).finally(() => setLoading(false));
  useEffect(() => { fetchSub(); }, [id]);

  const handleActivate = async () => { try { await api.activateSubscription(id); toast.success('Activated!'); fetchSub(); } catch (e) { toast.error(e.message); } };
  const handleCancel = async () => { try { await api.cancelAdminSubscription(id, 'User requested'); toast.success('Cancelled'); fetchSub(); } catch (e) { toast.error(e.message); } };
  const handleGenerateInvoice = async () => { try { await api.generateInvoice(id); toast.success('Invoice generated!'); fetchSub(); } catch (e) { toast.error(e.message); } };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-cv-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!sub) return <div className="text-center py-20 text-cv-text-muted">Subscription not found</div>;

  const renderPricing = (str) => { try { const p = JSON.parse(str || '{}'); return p.model === 'flat' ? `₹${p.price}` : p.model === 'per_unit' ? `₹${p.unitPrice}/unit` : p.model || '—'; } catch { return '—'; } };

  return (
    <div>
      <Link to="/subscriptions" className="inline-flex items-center gap-1.5 text-sm text-cv-text-secondary hover:text-cv-text mb-4"><ArrowLeft size={16} /> Back</Link>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-cv-text">{sub.customer?.name}</h1>
          <p className="text-cv-text-secondary text-sm mt-1">{sub.planVersion?.plan?.name} • {sub.planVersion?.billingPeriod} • {sub.planVersion?.currency}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`badge badge-${sub.status.toLowerCase()}`}>{sub.status}</span>
          {sub.status === 'PENDING' && <button className="btn btn-primary btn-sm" onClick={handleActivate}><Play size={14} /> Activate</button>}
          {['ACTIVE', 'TRIAL'].includes(sub.status) && (
            <>
              <button className="btn btn-secondary btn-sm" onClick={handleGenerateInvoice}><FileText size={14} /> Generate Invoice</button>
              <button className="btn btn-danger btn-sm" onClick={handleCancel}><XCircle size={14} /> Cancel</button>
            </>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="glass-card p-4"><p className="text-xs text-cv-text-muted">Start Date</p><p className="font-medium mt-1">{new Date(sub.billingStartDate).toLocaleDateString()}</p></div>
        <div className="glass-card p-4"><p className="text-xs text-cv-text-muted">Billing Day</p><p className="font-medium mt-1">Day {sub.billingDay}</p></div>
        <div className="glass-card p-4"><p className="text-xs text-cv-text-muted">Net Terms</p><p className="font-medium mt-1">{sub.netTermsDays} days</p></div>
        <div className="glass-card p-4"><p className="text-xs text-cv-text-muted">Coupon</p><p className="font-medium mt-1">{sub.coupon ? <span className="badge badge-trial">{sub.coupon.code}</span> : '—'}</p></div>
      </div>

      {/* Components */}
      <div className="glass-card p-5 mb-6">
        <h3 className="text-sm font-semibold text-cv-text mb-3">Price Components</h3>
        <table className="data-table">
          <thead><tr><th>Name</th><th>Fee Type</th><th>Pricing</th><th>Metric</th></tr></thead>
          <tbody>
            {sub.components?.map((c) => (
              <tr key={c.id}>
                <td className="font-medium">{c.priceComponent?.name}</td>
                <td><span className="badge badge-finalized text-xs">{c.priceComponent?.feeType}</span></td>
                <td className="font-mono text-sm">{renderPricing(c.pricingOverride || c.priceComponent?.pricingModel)}</td>
                <td>{c.priceComponent?.billableMetric ? <span className="font-mono text-xs bg-cv-surface-2 px-2 py-0.5 rounded">{c.priceComponent.billableMetric.code}</span> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add-ons */}
      {sub.addons?.length > 0 && (
        <div className="glass-card p-5 mb-6">
          <h3 className="text-sm font-semibold text-cv-text mb-3"><Puzzle size={16} className="inline mr-1" /> Add-ons</h3>
          <table className="data-table">
            <thead><tr><th>Name</th><th>Fee Type</th><th>Price</th><th>Qty</th></tr></thead>
            <tbody>
              {sub.addons.map((a) => (
                <tr key={a.id}>
                  <td className="font-medium">{a.addon?.name}</td>
                  <td><span className="badge badge-draft text-xs">{a.addon?.feeType}</span></td>
                  <td>{formatCurrency(a.addon?.priceCents || 0)}</td>
                  <td>{a.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Invoices */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-cv-text mb-3">Invoices</h3>
        {sub.invoices?.length > 0 ? (
          <table className="data-table">
            <thead><tr><th>Invoice #</th><th>Status</th><th>Amount</th><th>Period</th><th>Due Date</th></tr></thead>
            <tbody>
              {sub.invoices.map((inv) => (
                <tr key={inv.id} className="cursor-pointer" onClick={() => window.location.href = `/invoices/${inv.id}`}>
                  <td className="font-mono text-sm">{inv.invoiceNumber}</td>
                  <td><span className={`badge badge-${inv.status.toLowerCase()}`}>{inv.status}</span></td>
                  <td className="font-medium">{formatCurrency(inv.totalCents)}</td>
                  <td className="text-cv-text-secondary text-xs">{new Date(inv.periodStart).toLocaleDateString()} — {new Date(inv.periodEnd).toLocaleDateString()}</td>
                  <td className="text-cv-text-secondary">{new Date(inv.dueDate).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-sm text-cv-text-muted">No invoices yet</p>}
      </div>
    </div>
  );
}
