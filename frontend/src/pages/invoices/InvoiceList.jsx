import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText } from 'lucide-react';
import api from '../../api/client';
import { formatCurrency } from '../../lib/currency';

export default function InvoiceList() {
  const [invoices, setInvoices] = useState([]);
  const [pagination, setPagination] = useState({});
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetch = (page = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ page, perPage: 20, ...(filter && { status: filter }) });
    api.getInvoices(params.toString()).then((d) => { setInvoices(d.data); setPagination(d.pagination); }).finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, [filter]);

  const statuses = ['', 'DRAFT', 'FINALIZED', 'PAID', 'OVERDUE', 'VOID'];

  return (
    <div>
      <div className="mb-6"><h1 className="text-2xl font-bold text-cv-text">Invoices</h1><p className="text-cv-text-secondary text-sm mt-1">{pagination.totalCount || 0} total</p></div>

      <div className="flex gap-1 mb-4 p-1 rounded-lg bg-cv-surface-2 inline-flex">
        {statuses.map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${filter === s ? 'bg-cv-primary text-white' : 'text-cv-text-secondary hover:text-cv-text'}`}>{s || 'All'}</button>
        ))}
      </div>

      <div className="glass-card overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Invoice #</th><th>Customer</th><th>Plan</th><th>Status</th><th>Amount</th><th>Due Date</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="6" className="text-center py-10 text-cv-text-muted">Loading...</td></tr> :
              invoices.length === 0 ? <tr><td colSpan="6" className="text-center py-10"><FileText size={32} className="mx-auto mb-2 opacity-30 text-cv-text-muted" /><p className="text-cv-text-muted">No invoices</p></td></tr> :
              invoices.map((inv) => (
                <tr key={inv.id} className="cursor-pointer" onClick={() => navigate(`/invoices/${inv.id}`)}>
                  <td className="font-mono text-sm font-medium">{inv.invoiceNumber}</td>
                  <td>{inv.customer?.name}</td>
                  <td className="text-cv-text-secondary text-sm">{inv.subscription?.planVersion?.plan?.name || '—'}</td>
                  <td><span className={`badge badge-${inv.status.toLowerCase()}`}>{inv.status}</span></td>
                  <td className="font-medium">{formatCurrency(inv.totalCents)}</td>
                  <td className="text-cv-text-secondary">{new Date(inv.dueDate).toLocaleDateString()}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}
