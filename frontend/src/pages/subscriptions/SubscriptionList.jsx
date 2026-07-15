import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, CreditCard } from 'lucide-react';
import api from '../../api/client';

export default function SubscriptionList() {
  const [subs, setSubs] = useState([]);
  const [pagination, setPagination] = useState({});
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetch = (page = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ page, perPage: 20, ...(filter && { status: filter }) });
    api.getSubscriptions(params.toString()).then((d) => { setSubs(d.data); setPagination(d.pagination); }).finally(() => setLoading(false));
  };

  useEffect(() => { fetch(); }, [filter]);

  const statuses = ['', 'ACTIVE', 'TRIAL', 'PENDING', 'CANCELLED', 'ENDED'];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-bold text-cv-text">Subscriptions</h1><p className="text-cv-text-secondary text-sm mt-1">{pagination.totalCount || 0} total</p></div>
        <Link to="/subscriptions/new" className="btn btn-primary"><Plus size={16} /> New Subscription</Link>
      </div>

      <div className="flex gap-1 mb-4 p-1 rounded-lg bg-cv-surface-2 inline-flex">
        {statuses.map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${filter === s ? 'bg-cv-primary text-white' : 'text-cv-text-secondary hover:text-cv-text'}`}>
            {s || 'All'}
          </button>
        ))}
      </div>

      <div className="glass-card overflow-hidden">
        <table className="data-table">
          <thead><tr><th>Customer</th><th>Plan</th><th>Status</th><th>Period</th><th>Components</th><th>Start Date</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan="6" className="text-center py-10 text-cv-text-muted">Loading...</td></tr> :
              subs.length === 0 ? <tr><td colSpan="6" className="text-center py-10"><CreditCard size={32} className="mx-auto mb-2 opacity-30 text-cv-text-muted" /><p className="text-cv-text-muted">No subscriptions</p></td></tr> :
              subs.map((s) => (
                <tr key={s.id} className="cursor-pointer" onClick={() => navigate(`/subscriptions/${s.id}`)}>
                  <td className="font-medium">{s.customer?.name}</td>
                  <td>{s.planVersion?.plan?.name || '—'}</td>
                  <td><span className={`badge badge-${s.status.toLowerCase()}`}>{s.status}</span></td>
                  <td className="text-cv-text-secondary text-sm">{s.planVersion?.billingPeriod}</td>
                  <td>{s._count?.components || 0}</td>
                  <td className="text-cv-text-secondary">{new Date(s.billingStartDate).toLocaleDateString()}</td>
                </tr>
              ))
            }
          </tbody>
        </table>
      </div>
    </div>
  );
}
