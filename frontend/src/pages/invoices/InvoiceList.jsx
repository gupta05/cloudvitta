import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import api from '../../api/client';
import { formatCurrency } from '../../lib/currency';
import { formatDate } from '../../lib/format';
import { TableSkeleton } from '../../components/ui/Skeleton';
import Pagination from '../../components/ui/Pagination';
import TabPills from '../../components/ui/TabPills';

export default function InvoiceList() {
  const [invoices, setInvoices] = useState([]);
  const [pagination, setPagination] = useState({});
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const fetch = (page = 1) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page, perPage: 20, ...(filter && { status: filter }) });
    api.getInvoices(params.toString()).then((d) => { setInvoices(d.data); setPagination(d.pagination); })
      .catch((err) => setError(err.message || 'Failed to load invoices'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, [filter]);

  const statusTabs = ['', 'DRAFT', 'FINALIZED', 'PAID', 'OVERDUE', 'VOID'].map((s) => ({ key: s, label: s || 'All' }));

  return (
    <div>
      <div className="mb-6"><h1 className="text-2xl font-bold text-cv-text">Invoices</h1><p className="text-cv-text-secondary text-sm mt-1">{pagination.totalCount || 0} total</p></div>

      {error && <p className="text-sm text-cv-danger mb-4" role="alert">{error}</p>}

      <div className="mb-4">
        <TabPills tabs={statusTabs} active={filter} onChange={setFilter} />
      </div>

      <div className="glass-card overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Invoice #</th><th>Customer</th><th>Plan</th><th>Status</th><th>Amount</th><th>Due Date</th></tr></thead>
          {loading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : (
            <tbody>
              {invoices.length === 0 ? (
                <tr><td colSpan="6" className="text-center py-10"><FileText size={32} className="mx-auto mb-2 opacity-30 text-cv-text-muted" /><p className="text-cv-text-muted">No invoices</p></td></tr>
              ) : invoices.map((inv) => (
                <tr key={inv.id} className="cursor-pointer" onClick={() => navigate(`/invoices/${inv.id}`)}>
                  <td className="font-mono text-sm font-medium">{inv.invoiceNumber}</td>
                  <td>{inv.customer?.name}</td>
                  <td className="text-cv-text-secondary text-sm">{inv.subscription?.planVersion?.plan?.name || '—'}</td>
                  <td><span className={`badge badge-${inv.status.toLowerCase()}`}>{inv.status}</span></td>
                  <td className="font-medium">{formatCurrency(inv.totalCents)}</td>
                  <td className="text-cv-text-secondary">{formatDate(inv.dueDate)}</td>
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>

      <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={fetch} />
    </div>
  );
}
