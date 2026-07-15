import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { User, Shield, HardDrive, CreditCard, Monitor, Bell, ArrowLeft, AlertTriangle, Clock, Globe } from 'lucide-react';
import api from '../../api/client';
import ErrorBanner from '../../components/ui/ErrorBanner';
import { toast } from 'sonner';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 2 ? 2 : 0)} ${sizes[i]}`;
}

function parseUA(ua) {
  if (!ua) return 'Unknown';
  if (ua.includes('Chrome')) return 'Chrome';
  if (ua.includes('Firefox')) return 'Firefox';
  if (ua.includes('Safari')) return 'Safari';
  if (ua.includes('Edge')) return 'Edge';
  return ua.substring(0, 40);
}

export default function UserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [user, setUser] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
    if (deactivate && !confirm('Deactivate this user? They will be unable to log in.')) return;
    try {
      await api.updateUser(id, { deactivate });
      toast.success(deactivate ? 'User deactivated' : 'User reactivated');
      fetchUser();
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async () => {
    if (!confirm('Permanently delete this user and all their data? This cannot be undone.')) return;
    if (!confirm('This will delete ALL storage files, invoices, and subscriptions. Are you absolutely sure?')) return;
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

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-cv-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <ErrorBanner message={error} onRetry={fetchUser} />;
  if (!user) return null;

  const roleColors = { admin: 'badge-active', member: 'badge-finalized', user: 'badge-draft' };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate('/users')} className="p-2 rounded-lg hover:bg-cv-surface-2 text-cv-text-muted hover:text-cv-text transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-4 flex-1">
          <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white bg-cv-primary">
            {user.displayName?.charAt(0)?.toUpperCase() || '?'}
          </div>
          <div>
            <h1 className="text-xl font-bold text-cv-text flex items-center gap-2">
              {user.displayName}
              <span className={`badge ${roleColors[user.role] || 'badge-draft'}`}>{user.role}</span>
              {user.deactivatedAt && <span className="badge badge-cancelled">Deactivated</span>}
            </h1>
            <p className="text-sm text-cv-text-muted">{user.email}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleToggleActive} className={`btn btn-sm ${user.deactivatedAt ? 'btn-primary' : 'btn-danger'}`}>
            {user.deactivatedAt ? 'Reactivate' : 'Deactivate'}
          </button>
          <button onClick={handleDelete} className="btn btn-danger btn-sm">Delete</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg bg-cv-surface-2 inline-flex">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t.key ? 'bg-cv-primary text-white' : 'text-cv-text-secondary hover:text-cv-text'}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* ─── Overview ─── */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* User Info */}
          <div className="lg:col-span-2 space-y-6">
            <div className="glass-card p-6">
              <h3 className="text-sm font-semibold text-cv-text mb-4">Account Details</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
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
                  <p className="text-cv-text mt-1">{user.isVerified ? '✅ Yes' : '❌ No'}</p>
                </div>
                <div>
                  <span className="text-cv-text-muted">Created</span>
                  <p className="text-cv-text mt-1">{new Date(user.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                </div>
                <div>
                  <span className="text-cv-text-muted">Last Login</span>
                  <p className="text-cv-text mt-1">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Never'}</p>
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
          <div className="px-5 py-4 border-b border-cv-border">
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
                    <td className="text-cv-text-muted text-sm">{new Date(s.lastActiveAt).toLocaleString()}</td>
                    <td className="text-cv-text-muted text-sm">{new Date(s.createdAt).toLocaleString()}</td>
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
          <div className="px-5 py-4 border-b border-cv-border">
            <h3 className="text-sm font-semibold text-cv-text">Notifications ({notifications.length})</h3>
          </div>
          {notifications.length > 0 ? (
            <div className="divide-y divide-cv-border">
              {notifications.map((n) => (
                <div key={n.id} className={`px-5 py-4 ${!n.isRead ? 'bg-cv-surface-2' : ''}`}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${!n.isRead ? 'bg-cv-primary' : 'bg-cv-text-muted'}`} />
                      <span className="text-sm font-medium text-cv-text">{n.title}</span>
                      <span className="badge badge-draft text-xs">{n.type}</span>
                    </div>
                    <span className="text-xs text-cv-text-muted">{new Date(n.createdAt).toLocaleString()}</span>
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
    </div>
  );
}
