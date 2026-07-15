import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Search, Users } from 'lucide-react';
import api from '../../api/client';

export default function CustomerList() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fetchCustomers = (page = 1) => {
    setLoading(true);
    const params = new URLSearchParams({ page, perPage: 20, ...(search && { search }) });
    api.getCustomers(params.toString()).then((data) => {
      setCustomers(data.data);
      setPagination(data.pagination);
    }).finally(() => setLoading(false));
  };

  useEffect(() => { fetchCustomers(); }, []);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchCustomers();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-cv-text">Customers</h1>
          <p className="text-cv-text-secondary text-sm mt-1">{pagination.totalCount || 0} total customers</p>
        </div>
        <Link to="/customers/new" className="btn btn-primary"><Plus size={16} /> Add Customer</Link>
      </div>

      <form onSubmit={handleSearch} className="mb-4 flex gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cv-text-muted" />
          <input className="form-input pl-10" placeholder="Search by name, email, or alias..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <button type="submit" className="btn btn-secondary">Search</button>
      </form>

      <div className="glass-card overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Alias</th>
              <th>Subscriptions</th>
              <th>Invoices</th>
              <th>Currency</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" className="text-center py-10 text-cv-text-muted">Loading...</td></tr>
            ) : customers.length === 0 ? (
              <tr><td colSpan="6" className="text-center py-10">
                <Users size={32} className="mx-auto mb-2 text-cv-text-muted opacity-40" />
                <p className="text-cv-text-muted">No customers yet</p>
              </td></tr>
            ) : customers.map((c) => (
              <tr key={c.id} className="cursor-pointer" onClick={() => navigate(`/customers/${c.id}`)}>
                <td className="font-medium">{c.name}</td>
                <td className="text-cv-text-secondary">{c.email || '—'}</td>
                <td><span className="text-xs bg-cv-surface-2 px-2 py-0.5 rounded font-mono">{c.alias || '—'}</span></td>
                <td>{c._count?.subscriptions || 0}</td>
                <td>{c._count?.invoices || 0}</td>
                <td><span className="badge badge-active">{c.currency}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          {Array.from({ length: pagination.totalPages }, (_, i) => (
            <button key={i} onClick={() => fetchCustomers(i + 1)} className={`btn btn-sm ${pagination.page === i + 1 ? 'btn-primary' : 'btn-ghost'}`}>{i + 1}</button>
          ))}
        </div>
      )}
    </div>
  );
}
