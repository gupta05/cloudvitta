import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User, Shield, HardDrive, CreditCard, Monitor, Bell, ArrowLeft, Check, X } from 'lucide-react';
import api from '../../api/client';
import ErrorBanner from '../../components/ui/ErrorBanner';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import TabPills from '../../components/ui/TabPills';
import { formatBytes, formatDate } from '../../lib/format';
import { ROLE_BADGES, parseUA } from '../../lib/uiMaps';
import { toast } from 'sonner';

export default function UserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [user, setUser] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const fetchUser = async () => {
    setLoading(true);
    setError(null);
    try {
      const userData = await api.getUser(id);
      setUser(userData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchSessions = async () => {
    try {
      const res = await api.getUserSessions(id);
      setSessions(res?.data || []);
    } catch (err) { console.error(err); }
  };

  const fetchNotifications = async () => {
    try {
      const res = await api.getUserNotifications(id);
      setNotifications(res?.data || []);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { fetchUser(); }, [id]);

  useEffect(() => {
    if (tab === 'sessions') fetchSessions();
    if (tab === 'notifications') fetchNotifications();
  }, [tab]);

  const handleRoleChange = async (role) => {
    try {
      await api.updateUser(id, { role });
      toast.success(`Role changed to ${role}`);
      fetchUser();
    } catch (err) { toast.error(err.message); }
  };

  const handleToggleActive = async () => {
    const deactivate = !user.deactivatedAt;
    try {
      await api.updateUser(id, { deactivate });
      toast.success(deactivate ? 'User deactivated' : 'User reactivated');
      fetchUser();
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async () => {
    try {
      await api.deleteUser(id);
      toast.success('User deleted');
      navigate('/users');
    } catch (err) { toast.error(err.message); }
  };

  const tabs = [
    { key: 'overview', label: 'Overview', icon: User },
    { key: 'sessions', label: 'Sessions', icon: Monitor },
    { key: 'notifications', label: 'Notifications', icon: Bell },
  ];

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} onRetry={fetchUser} />;
  if (!user) return null;

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4 mb-6">
        <button onClick={() => navigate('/users')} className="icon-btn" aria-label="Back to users">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-4 flex-1">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white bg-cv-primary">
            {user.displayName?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-cv-text flex items-center gap-2">
              {user.displayName}
              <span className={`badge ${ROLE_BADGES[user.role] || 'badge-draft'}`}>{user.role}</span>
              {user.deactivatedAt && <span className="badge badge-cancelled">Deactivated</span>}
            </h1>
            <p className="text-sm text-cv-text-muted mt-1">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => (user.deactivatedAt ? handleToggleActive() : setShowDeactivate(true))}
            className={`btn btn-sm ${user.deactivatedAt ? 'btn-primary' : 'btn-danger'}`}
          >
            {user.deactivatedAt ? 'Reactivate' : 'Deactivate'}
          </button>
          <button onClick={() => setShowDelete(true)} className="btn btn-danger btn-sm">Delete</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <TabPills tabs={tabs} active={tab} onChange={setTab} />
      </div>

      {/* ─── Overview ─── */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* User Info */}
          <div className="lg:col-span-2 space-y-6">
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-cv-text mb-4">Account Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-cv-text-muted">User ID</span>
                  <p className="font-mono text-cv-text text-xs mt-1">{user.id}</p>
                </div>
                <div>
                  <span className="text-cv-text-muted">Organization</span>
                  <p className="text-cv-text mt-1">{user.organization?.name || '—'}</p>
                </div>
                <div>
                  <span className="text-cv-text-muted">Tenant</span>
                  <p className="text-cv-text mt-1">{user.tenant?.name || '—'}</p>
                </div>
                <div>
                  <span className="text-cv-text-muted">Customer</span>
                  <p className="text-cv-text mt-1">{user.customer?.name || '—'} {user.customer?.alias ? `(${user.customer.alias})` : ''}</p>
                </div>
                <div>
                  <span className="text-cv-text-muted">Phone</span>
                  <p className="text-cv-text mt-1">{user.phone || '—'}</p>
                </div>
                <div>
                  <span className="text-cv-text-muted">Email Verified</span>
                  <p className="text-cv-text mt-1 flex items-center gap-1.5">
                    {user.isVerified
                      ? <><Check size={14} className="text-cv-success" aria-hidden="true" /> Yes</>
                      : <><X size={14} className="text-cv-danger" aria-hidden="true" /> No</>}
                  </p>
                </div>
                <div>
                  <span className="text-cv-text-muted">Created</span>
                  <p className="text-cv-text mt-1">{formatDate(user.createdAt, 'long')}</p>
                </div>
                <div>
                  <span className="text-cv-text-muted">Last Login</span>
                  <p className="text-cv-text mt-1">{user.lastLoginAt ? formatDate(user.lastLoginAt, 'datetime') : 'Never'}</p>
                </div>
              </div>
            </div>

            {/* Role Management */}
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-cv-text mb-4 flex items-center gap-2"><Shield size={16} className="text-cv-accent" /> Role Management</h3>
              <div className="flex gap-3">
                {['admin', 'member', 'user'].map((role) => (
                  <button
                    key={role}
                    onClick={() => handleRoleChange(role)}
                    aria-pressed={user.role === role}
                    className={`px-4 py-2 rounded-lg text-sm font-medium border transition-all ${user.role === role
                      ? 'bg-cv-primary text-white border-cv-primary'
                      : 'bg-cv-bg text-cv-text-secondary border-cv-border hover:border-cv-primary hover:text-cv-text'}`}
                  >
                    {role.charAt(0).toUpperCase() + role.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Summary */}
          <div className="space-y-4">
            {user.summary && (
              <>
                <div className="glass-card p-5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-cv-text-muted uppercase tracking-wide mb-2"><HardDrive size={14} /> Storage</div>
                  <p className="text-2xl font-bold text-cv-text">{formatBytes(user.summary.totalStorageBytes)}</p>
                  <p className="text-xs text-cv-text-muted">{user.summary.buckets} buckets</p>
                </div>
                <div className="glass-card p-5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-cv-text-muted uppercase tracking-wide mb-2"><CreditCard size={14} /> Billing</div>
                  <p className="text-2xl font-bold text-cv-text">{user.summary.subscriptions}</p>
                  <p className="text-xs text-cv-text-muted">subscriptions · {user.summary.invoices} invoices</p>
                </div>
                <div className="glass-card p-5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-cv-text-muted uppercase tracking-wide mb-2"><Monitor size={14} /> Sessions</div>
                  <p className="text-2xl font-bold text-cv-text">{user.summary.activeSessions}</p>
                  <p className="text-xs text-cv-text-muted">active sessions</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Sessions ─── */}
      {tab === 'sessions' && (
        <div className="glass-card overflow-hidden">
          <div className="card-header">
            <h3 className="text-sm font-semibold text-cv-text">Session History ({sessions.length})</h3>
          </div>
          {sessions.length > 0 ? (
            <table className="data-table">
              <thead>
                <tr><th>Browser</th><th>IP Address</th><th>Status</th><th>Last Active</th><th>Created</th></tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.id}>
                    <td className="text-sm">{parseUA(s.userAgent)}</td>
                    <td className="font-mono text-xs text-cv-text-secondary">{s.ipAddress || '—'}</td>
                    <td>
                      <span className={`badge ${s.isActive ? 'badge-active' : 'badge-cancelled'}`}>
                        {s.isActive ? 'Active' : 'Expired'}
                      </span>
                    </td>
                    <td className="text-cv-text-muted text-sm">{formatDate(s.lastActiveAt, 'datetime')}</td>
                    <td className="text-cv-text-muted text-sm">{formatDate(s.createdAt, 'datetime')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-cv-text-muted text-sm">No sessions</div>
          )}
        </div>
      )}

      {/* ─── Notifications ─── */}
      {tab === 'notifications' && (
        <div className="glass-card overflow-hidden">
          <div className="card-header">
            <h3 className="text-sm font-semibold text-cv-text">Notifications ({notifications.length})</h3>
          </div>
          {notifications.length > 0 ? (
            <div className="divide-y divide-cv-border">
              {notifications.map((n) => (
                <div key={n.id} className={`px-5 py-4 ${!n.isRead ? 'bg-cv-surface-2' : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${!n.isRead ? 'bg-cv-primary' : 'bg-cv-text-muted'}`} aria-hidden="true" />
                      <span className="text-sm font-medium text-cv-text">{n.title}</span>
                      <span className="badge badge-draft text-xs">{n.type}</span>
                    </div>
                    <span className="text-xs text-cv-text-muted">{formatDate(n.createdAt, 'datetime')}</span>
                  </div>
                  <p className="text-sm text-cv-text-secondary ml-4">{n.message}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-cv-text-muted text-sm">No notifications</div>
          )}
        </div>
      )}

      {/* Deactivate confirmation */}
      <ConfirmDialog
        open={showDeactivate}
        onClose={() => setShowDeactivate(false)}
        onConfirm={handleToggleActive}
        title="Deactivate user?"
        message={`${user.displayName} will be unable to log in until reactivated.`}
        confirmLabel="Deactivate"
        danger
      />

      {/* Delete confirmation */}
      <ConfirmDialog
        open={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Permanently delete user?"
        message={`This will delete ${user.displayName} and ALL their data — storage files, invoices, and subscriptions. This cannot be undone.`}
        confirmLabel="Delete User"
        danger
      />
    </div>
  );
}
