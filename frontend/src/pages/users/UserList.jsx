import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Search, ChevronRight, Shield, User, UserX, Filter } from 'lucide-react';
import api from '../../api/client';
import ErrorBanner from '../../components/ui/ErrorBanner';

export default function UserList() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 0 });

  const fetchUsers = async (page = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (roleFilter) params.set('role', roleFilter);
      if (statusFilter) params.set('status', statusFilter);
      params.set('page', page);
      params.set('limit', '20');

      const res = await api.getUsers(params.toString());
      setUsers(res?.data || []);
      setPagination(res?.pagination || { page: 1, total: 0, totalPages: 0 });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); }, [roleFilter, statusFilter]);

  const handleSearch = (e) => {
    e.preventDefault();
    fetchUsers(1);
  };

  const roleColors = {
    admin: 'badge-active',
    member: 'badge-finalized',
    user: 'badge-draft',
  };

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-cv-text">Users</h1>
          <p className="text-cv-text-secondary text-sm mt-1">{pagination.total} total users</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <form onSubmit={handleSearch} className="flex-1 min-w-[240px] max-w-md relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-cv-text-muted" />
          <input className="form-input pl-9" placeholder="Search by name or email..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
        <select className="form-input w-auto" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
          <option value="">All Roles</option>
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="user">User</option>
        </select>
        <select className="form-input w-auto" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="deactivated">Deactivated</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-cv-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => fetchUsers()} />
      ) : (
        <>
          <div className="glass-card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Tenant</th>
                  <th>Status</th>
                  <th>Last Login</th>
                  <th>Created</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan="7" className="text-center py-10 text-cv-text-muted">No users found</td></tr>
                ) : users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white bg-cv-primary flex-shrink-0">
                          {user.displayName?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-cv-text truncate">{user.displayName}</p>
                          <p className="text-xs text-cv-text-muted truncate">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${roleColors[user.role] || 'badge-draft'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="text-cv-text-secondary text-sm">{user.tenant?.name || '—'}</td>
                    <td>
                      {user.deactivatedAt ? (
                        <span className="badge badge-cancelled">Deactivated</span>
                      ) : (
                        <span className="badge badge-active">Active</span>
                      )}
                    </td>
                    <td className="text-cv-text-muted text-sm">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="text-cv-text-muted text-sm">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td>
                      <Link to={`/users/${user.id}`} className="text-cv-primary hover:text-cv-primary-hover text-xs font-medium flex items-center gap-1">
                        View <ChevronRight size={12} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-cv-text-muted">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => fetchUsers(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="btn btn-secondary btn-sm disabled:opacity-40"
                >Previous</button>
                <button
                  onClick={() => fetchUsers(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="btn btn-secondary btn-sm disabled:opacity-40"
                >Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
