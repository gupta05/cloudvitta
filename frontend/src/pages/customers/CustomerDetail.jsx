import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CreditCard, FileText, Activity } from 'lucide-react';
import api from '../../api/client';
import { formatCurrency } from '../../lib/currency';
import { formatDate } from '../../lib/format';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import PageHeader from '../../components/ui/PageHeader';
import EmptyState from '../../components/ui/EmptyState';

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getCustomer(id).then(setCustomer).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <LoadingSpinner />;
  if (!customer) return <div className="text-cv-text-muted text-center py-20">Customer not found</div>;

  return (
    <div>
      <PageHeader
        title={customer.name}
        subtitle={<>{customer.email} {customer.alias && <span className="ml-2 font-mono text-xs bg-cv-surface-2 px-2 py-0.5 rounded">@{customer.alias}</span>}</>}
        backTo="/customers"
        actions={<span className="badge badge-active">{customer.currency}</span>}
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="icon-chip"><CreditCard size={20} className="text-cv-primary" /></div>
          <div><p className="text-xs text-cv-text-muted">Subscriptions</p><p className="text-lg font-bold">{customer._count?.subscriptions || 0}</p></div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="icon-chip"><FileText size={20} className="text-cv-accent" /></div>
          <div><p className="text-xs text-cv-text-muted">Invoices</p><p className="text-lg font-bold">{customer._count?.invoices || 0}</p></div>
        </div>
        <div className="glass-card p-4 flex items-center gap-3">
          <div className="icon-chip"><Activity size={20} className="text-cv-success" /></div>
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
                <tr key={s.id} className="cursor-pointer" onClick={() => navigate(`/subscriptions/${s.id}`)}>
                  <td className="font-medium">{s.planVersion?.plan?.name || 'Unknown'}</td>
                  <td><span className={`badge badge-${s.status.toLowerCase()}`}>{s.status}</span></td>
                  <td>{s.planVersion?.billingPeriod}</td>
                  <td>{formatDate(s.billingStartDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState icon={CreditCard} title="No subscriptions" compact />}
      </div>

      {/* Recent Invoices */}
      <div className="glass-card p-5">
        <h3 className="text-sm font-semibold text-cv-text mb-4">Recent Invoices</h3>
        {customer.invoices?.length > 0 ? (
          <table className="data-table">
            <thead><tr><th>Invoice #</th><th>Status</th><th>Amount</th><th>Date</th></tr></thead>
            <tbody>
              {customer.invoices.map((inv) => (
                <tr key={inv.id} className="cursor-pointer" onClick={() => navigate(`/invoices/${inv.id}`)}>
                  <td className="font-mono text-sm">{inv.invoiceNumber}</td>
                  <td><span className={`badge badge-${inv.status.toLowerCase()}`}>{inv.status}</span></td>
                  <td className="font-medium">{formatCurrency(inv.totalCents)}</td>
                  <td>{formatDate(inv.issueDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <EmptyState icon={FileText} title="No invoices" compact />}
      </div>
    </div>
  );
}
