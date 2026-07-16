import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, CreditCard } from 'lucide-react';
import api from '../../api/client';
import { formatDate } from '../../lib/format';
import { TableSkeleton } from '../../components/ui/Skeleton';
import Pagination from '../../components/ui/Pagination';
import TabPills from '../../components/ui/TabPills';

export default function SubscriptionList() {
  const [subs, setSubs] = useState([]);
  const [pagination, setPagination] = useState({});
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const fetch = (page = 1) => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page, perPage: 20, ...(filter && { status: filter }) });
    api.getSubscriptions(params.toString()).then((d) => { setSubs(d.data); setPagination(d.pagination); })
      .catch((err) => setError(err.message || 'Failed to load subscriptions'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, [filter]);

  const statusTabs = ['', 'ACTIVE', 'TRIAL', 'PENDING', 'CANCELLED', 'ENDED'].map((s) => ({ key: s, label: s || 'All' }));

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div><h1 className="text-2xl font-bold text-cv-text">Subscriptions</h1><p className="text-cv-text-secondary text-sm mt-1">{pagination.totalCount || 0} total</p></div>
        <Link to="/subscriptions/new" className="btn btn-primary"><Plus size={16} /> New Subscription</Link>
      </div>

      {error && <p className="text-sm text-cv-danger mb-4" role="alert">{error}</p>}

      <div className="mb-4">
        <TabPills tabs={statusTabs} active={filter} onChange={setFilter} />
      </div>

      <div className="glass-card overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Customer</th><th>Plan</th><th>Status</th><th>Period</th><th>Components</th><th>Start Date</th></tr></thead>
          {loading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : (
            <tbody>
              {subs.length === 0 ? (
                <tr><td colSpan="6" className="text-center py-10"><CreditCard size={32} className="mx-auto mb-2 opacity-30 text-cv-text-muted" /><p className="text-cv-text-muted">No subscriptions</p></td></tr>
              ) : subs.map((s) => (
                <tr key={s.id} className="cursor-pointer" onClick={() => navigate(`/subscriptions/${s.id}`)}>
                  <td className="font-medium">{s.customer?.name}</td>
                  <td>{s.planVersion?.plan?.name || '—'}</td>
                  <td><span className={`badge badge-${s.status.toLowerCase()}`}>{s.status}</span></td>
                  <td className="text-cv-text-secondary text-sm">{s.planVersion?.billingPeriod}</td>
                  <td>{s._count?.components || 0}</td>
                  <td className="text-cv-text-secondary">{formatDate(s.billingStartDate)}</td>
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
