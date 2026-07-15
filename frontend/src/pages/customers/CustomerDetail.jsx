import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, CreditCard, FileText, Activity } from 'lucide-react';
import api from '../../api/client';
import { formatCurrency } from '../../lib/currency';

export default function CustomerDetail() {
  const { id } = useParams();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCustomer(id).then(setCustomer).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-cv-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!customer) return <div className="text-cv-text-muted text-center py-20">Customer not found</div>;

  return (
    <div>
      <Link to="/customers" className="inline-flex items-center gap-1.5 text-sm text-cv-text-secondary hover:text-cv-text mb-4"><ArrowLeft size={16} /> Back to Customers</Link>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-cv-text">{customer.name}</h1>
          <p className="text-cv-text-secondary text-sm mt-1">{customer.email} {customer.alias && <span className="ml-2 font-mono text-xs bg-cv-surface-2 px-2 py-0.5 rounded">@{customer.alias}</span>}</p>
        </div>
        <span className="badge badge-active">{customer.currency}</span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="glass-card p-4 flex items-center gap-3">
          <CreditCard size={20} className="text-cv-primary" />
          <div><p className="text-xs text-cv-text-muted">Subscriptions</p><p className="text-lg font-bold">{customer._count?.subscriptions || 0}</p></div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <FileText size={20} className="text-cv-accent" />
          <div><p className="text-xs text-cv-text-muted">Invoices</p><p className="text-lg font-bold">{customer._count?.invoices || 0}</p></div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <Activity size={20} className="text-cv-success" />
          <div><p className="text-xs text-cv-text-muted">Usage Events</p><p className="text-lg font-bold">{customer._count?.usageEvents || 0}</p></div>
        </div>
      </div>

      {/* Subscriptions */}
      <div className="glass-card p-5 mb-6">
        <h3 className="text-sm font-semibold text-cv-text mb-4">Recent Subscriptions</h3>
        {customer.subscriptions?.length > 0 ? (
          <table className="data-table">
            <thead><tr><th>Plan</th><th>Status</th><th>Billing Period</th><th>Start Date</th></tr></thead>
            <tbody>
              {customer.subscriptions.map((s) => (
                <tr key={s.id} className="cursor-pointer" onClick={() => window.location.href = `/subscriptions/${s.id}`}>
                  <td className="font-medium">{s.planVersion?.plan?.name || 'Unknown'}</td>
                  <td><span className={`badge badge-${s.status.toLowerCase()}`}>{s.status}</span></td>
                  <td>{s.planVersion?.billingPeriod}</td>
                  <td>{new Date(s.billingStartDate).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-sm text-cv-text-muted">No subscriptions</p>}
      </div>

      {/* Recent Invoices */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-cv-text mb-4">Recent Invoices</h3>
        {customer.invoices?.length > 0 ? (
          <table className="data-table">
            <thead><tr><th>Invoice #</th><th>Status</th><th>Amount</th><th>Date</th></tr></thead>
            <tbody>
              {customer.invoices.map((inv) => (
                <tr key={inv.id} className="cursor-pointer" onClick={() => window.location.href = `/invoices/${inv.id}`}>
                  <td className="font-mono text-sm">{inv.invoiceNumber}</td>
                  <td><span className={`badge badge-${inv.status.toLowerCase()}`}>{inv.status}</span></td>
                  <td className="font-medium">{formatCurrency(inv.totalCents)}</td>
                  <td>{new Date(inv.issueDate).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-sm text-cv-text-muted">No invoices</p>}
      </div>
    </div>
  );
}
