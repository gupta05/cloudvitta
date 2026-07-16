import { useEffect, useState } from 'react';
import { User, Shield, Trash2, Lock, Monitor, Key, LogOut, AlertTriangle, Check, Copy, Plus, Clock, Globe } from 'lucide-react';
import api from '../../api/client';
import ErrorBanner from '../../components/ui/ErrorBanner';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import TabPills from '../../components/ui/TabPills';
import { formatDate } from '../../lib/format';
import { parseUA } from '../../lib/uiMaps';
import { toast } from 'sonner';

export default function CustomerAccount() {
  const [tab, setTab] = useState('profile');
  const [profile, setProfile] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Profile form
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // Password form
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  // Delete form
  const [delPassword, setDelPassword] = useState('');
  const [delConfirm, setDelConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [showDelDialog, setShowDelDialog] = useState(false);

  // API key
  const [showKeyCreate, setShowKeyCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [creatingKey, setCreatingKey] = useState(false);
  const [newToken, setNewToken] = useState(null);
  const [revokeKeyTarget, setRevokeKeyTarget] = useState(null);
  const [showRevokeAll, setShowRevokeAll] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, sessionsRes, keysRes] = await Promise.all([
        api.getProfile(),
        api.getSessions(),
        api.getPortalApiKeys(),
      ]);
      setProfile(profileRes);
      setEditName(profileRes.displayName || '');
      setEditPhone(profileRes.phone || '');
      setSessions(sessionsRes?.data || []);
      setKeys(keysRes?.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.updateProfile({ displayName: editName, phone: editPhone });
      setProfile((p) => ({ ...p, ...updated }));
      // Update localStorage
      const stored = JSON.parse(localStorage.getItem('cv_user') || '{}');
      stored.displayName = editName;
      localStorage.setItem('cv_user', JSON.stringify(stored));
      toast.success('Profile updated');
    } catch (err) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (newPw !== confirmPw) return toast.error('Passwords do not match');
    if (newPw.length < 6) return toast.error('Password must be at least 6 characters');
    setChangingPw(true);
    try {
      await api.changePassword({ currentPassword: currentPw, newPassword: newPw });
      toast.success('Password changed successfully');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) { toast.error(err.message); }
    finally { setChangingPw(false); }
  };

  const handleRevokeSession = async (id) => {
    try {
      await api.revokeSession(id);
      toast.success('Session revoked');
      setSessions((s) => s.map((sess) => sess.id === id ? { ...sess, isActive: false } : sess));
    } catch (err) { toast.error(err.message); }
  };

  const handleRevokeAll = async () => {
    try {
      await api.revokeAllSessions();
      toast.success('All other sessions revoked');
      setSessions((s) => s.map((sess) => sess.isCurrent ? sess : { ...sess, isActive: false }));
    } catch (err) { toast.error(err.message); }
  };

  const handleDeleteAccount = async (e) => {
    e.preventDefault();
    if (delConfirm !== 'DELETE') return toast.error('Please type DELETE to confirm');
    setDeleting(true);
    try {
      await api.deleteAccount({ password: delPassword, confirmation: delConfirm });
      toast.success('Account deleted');
      api.setToken(null); api.setTenantId(null); api.setCustomerId(null); api.setRole(null);
      localStorage.clear();
      // Intentional hard redirect: fully resets the SPA after account deletion.
      window.location.href = '/login';
    } catch (err) { toast.error(err.message); }
    finally { setDeleting(false); }
  };

  const handleCreateKey = async (e) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setCreatingKey(true);
    try {
      const result = await api.createPortalApiKey({ name: newKeyName.trim() });
      setNewToken(result.rawToken);
      setNewKeyName('');
      setShowKeyCreate(false);
      const keysRes = await api.getPortalApiKeys();
      setKeys(keysRes?.data || []);
    } catch (err) { toast.error(err.message); }
    finally { setCreatingKey(false); }
  };

  const handleRevokeKey = async (key) => {
    try {
      await api.revokePortalApiKey(key.id);
      toast.success('API key revoked');
      setKeys((k) => k.map((item) => item.id === key.id ? { ...item, isActive: false } : item));
    } catch (err) { toast.error(err.message); }
  };

  const tabs = [
    { key: 'profile', label: 'Profile', icon: User },
    { key: 'security', label: 'Security', icon: Shield },
    { key: 'delete', label: 'Delete Account', icon: Trash2 },
  ];

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} onRetry={fetchData} />;

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-cv-text">Account</h1>
        <p className="text-cv-text-secondary text-sm mt-1">Manage your profile, security, and account settings</p>
      </div>

      {/* Tabs */}
      <TabPills tabs={tabs} active={tab} onChange={setTab} />

      {/* ─── Profile Tab ─── */}
      {tab === 'profile' && (
        <div className="max-w-2xl space-y-6">
          {/* Avatar + Info */}
          <div className="glass-card p-6">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white bg-cv-primary">
                {profile?.displayName?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div>
                <h3 className="text-lg font-bold text-cv-text">{profile?.displayName}</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-sm text-cv-text-muted">{profile?.email}</span>
                  {profile?.isVerified && (
                    <span className="flex items-center gap-1 text-xs text-cv-success"><Check size={12} /> Verified</span>
                  )}
                </div>
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="form-label">Display Name</label>
                <input className="form-input" value={editName} onChange={(e) => setEditName(e.target.value)} required />
              </div>
              <div>
                <label className="form-label">Phone</label>
                <input className="form-input" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="Optional" />
              </div>
              <div>
                <label className="form-label">Email</label>
                <input className="form-input opacity-60 cursor-not-allowed" value={profile?.email || ''} disabled />
                <p className="text-xs text-cv-text-muted mt-1">Email cannot be changed</p>
              </div>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>

          {/* Account Info */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-cv-text mb-4">Account Information</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-cv-text-muted">Account ID</span>
                <p className="font-mono text-cv-text text-xs mt-1">{profile?.id}</p>
              </div>
              <div>
                <span className="text-cv-text-muted">Organization</span>
                <p className="text-cv-text mt-1">{profile?.organization?.name}</p>
              </div>
              <div>
                <span className="text-cv-text-muted">Member Since</span>
                <p className="text-cv-text mt-1">{profile?.createdAt ? formatDate(profile.createdAt, 'long') : '—'}</p>
              </div>
              <div>
                <span className="text-cv-text-muted">Last Login</span>
                <p className="text-cv-text mt-1">{profile?.lastLoginAt ? formatDate(profile.lastLoginAt, 'datetime') : 'Never'}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Security Tab ─── */}
      {tab === 'security' && (
        <div className="max-w-2xl space-y-6">
          {/* Change Password */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-cv-text mb-4 flex items-center gap-2"><Lock size={16} className="text-cv-accent" /> Change Password</h3>
            <form onSubmit={handleChangePassword} className="space-y-4">
              <div>
                <label className="form-label">Current Password</label>
                <input type="password" className="form-input" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} required />
              </div>
              <div>
                <label className="form-label">New Password</label>
                <input type="password" className="form-input" value={newPw} onChange={(e) => setNewPw(e.target.value)} required minLength={6} />
              </div>
              <div>
                <label className="form-label">Confirm New Password</label>
                <input type="password" className="form-input" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} required />
              </div>
              <button type="submit" className="btn btn-primary" disabled={changingPw}>
                {changingPw ? 'Changing...' : 'Change Password'}
              </button>
            </form>
          </div>

          {/* Active Sessions */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-cv-text flex items-center gap-2"><Monitor size={16} className="text-cv-accent" /> Active Sessions</h3>
              <button onClick={() => setShowRevokeAll(true)} className="btn btn-danger btn-sm"><LogOut size={14} /> Revoke All Others</button>
            </div>
            <div className="space-y-3">
              {sessions.filter(s => s.isActive).length === 0 ? (
                <p className="text-sm text-cv-text-muted">No active sessions</p>
              ) : sessions.filter(s => s.isActive).map((s) => (
                <div key={s.id} className="flex items-center justify-between p-3 rounded-lg bg-cv-bg border border-cv-border">
                  <div className="flex items-center gap-3">
                    <Monitor size={18} className="text-cv-text-muted" />
                    <div>
                      <p className="text-sm text-cv-text font-medium">
                        {parseUA(s.userAgent)}
                        {s.isCurrent && <span className="ml-2 text-xs text-cv-success">(This device)</span>}
                      </p>
                      <p className="text-xs text-cv-text-muted flex items-center gap-2">
                        <Globe size={10} /> {s.ipAddress || 'Unknown IP'} · Last active {formatDate(s.lastActiveAt, 'datetime')}
                      </p>
                    </div>
                  </div>
                  {!s.isCurrent && (
                    <button onClick={() => handleRevokeSession(s.id)} className="btn btn-danger btn-sm">Revoke</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Login History */}
          <div className="glass-card p-6">
            <h3 className="text-sm font-semibold text-cv-text mb-4 flex items-center gap-2"><Clock size={16} className="text-cv-accent" /> Login History</h3>
            <div className="space-y-2">
              {sessions.slice(0, 10).map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs py-2 border-b border-cv-border last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${s.isActive ? 'bg-cv-success' : 'bg-cv-text-muted'}`} aria-hidden="true" />
                    <span className="text-cv-text">{parseUA(s.userAgent)}</span>
                    <span className="text-cv-text-muted">· {s.ipAddress || '—'}</span>
                  </div>
                  <span className="text-cv-text-muted">{formatDate(s.createdAt, 'datetime')}</span>
                </div>
              ))}
              {sessions.length === 0 && <p className="text-sm text-cv-text-muted">No login history</p>}
            </div>
          </div>

          {/* API Keys */}
          <div className="glass-card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-cv-text flex items-center gap-2"><Key size={16} className="text-cv-accent" /> API Keys</h3>
              <button onClick={() => setShowKeyCreate(true)} className="btn btn-primary btn-sm"><Plus size={14} /> New Key</button>
            </div>

            {newToken && (
              <div className="p-4 rounded-lg bg-cv-warning/10 border border-cv-warning/20 mb-4">
                <p className="text-xs font-bold text-cv-warning mb-2">Copy this key now — it won't be shown again</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono bg-cv-bg px-3 py-2 rounded border border-cv-border text-cv-text break-all">{newToken}</code>
                  <button onClick={() => { navigator.clipboard.writeText(newToken); toast.success('Copied!'); }} className="btn btn-secondary btn-sm"><Copy size={14} /></button>
                </div>
                <button onClick={() => setNewToken(null)} className="text-xs text-cv-text-muted mt-2 hover:text-cv-text">Dismiss</button>
              </div>
            )}

            {keys.length > 0 ? (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Key Prefix</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.id}>
                      <td className="font-medium">{k.name}</td>
                      <td className="font-mono text-cv-text-muted">{k.prefix}••••••••</td>
                      <td><span className={`badge ${k.isActive ? 'badge-active' : 'badge-cancelled'}`}>{k.isActive ? 'Active' : 'Revoked'}</span></td>
                      <td className="text-right">
                        {k.isActive && (
                          <button onClick={() => setRevokeKeyTarget(k)} className="text-cv-danger text-xs font-medium hover:text-cv-danger/80">Revoke</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-cv-text-muted">No API keys</p>
            )}
          </div>
        </div>
      )}

      {/* ─── Delete Account Tab ─── */}
      {tab === 'delete' && (
        <div className="max-w-2xl">
          <div className="glass-card p-6 border-cv-danger/30">
            <div className="flex items-start gap-3 mb-6">
              <AlertTriangle size={24} className="text-cv-danger flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-bold text-cv-danger">Delete Account</h3>
                <p className="text-sm text-cv-text-muted mt-1">
                  This action is permanent and cannot be undone. All your data will be permanently deleted, including:
                </p>
                <ul className="text-sm text-cv-text-muted mt-2 space-y-1 list-disc list-inside">
                  <li>All storage buckets and files</li>
                  <li>All invoices and billing history</li>
                  <li>Your subscription and account data</li>
                  <li>All API keys and sessions</li>
                </ul>
              </div>
            </div>

            {!showDelDialog ? (
              <button onClick={() => setShowDelDialog(true)} className="btn btn-danger">
                <Trash2 size={16} /> I want to delete my account
              </button>
            ) : (
              <form onSubmit={handleDeleteAccount} className="space-y-4 pt-4 border-t border-cv-border">
                <div>
                  <label className="form-label">Enter your password</label>
                  <input type="password" className="form-input" value={delPassword} onChange={(e) => setDelPassword(e.target.value)} required />
                </div>
                <div>
                  <label className="form-label">Type <code className="text-cv-danger font-bold">DELETE</code> to confirm</label>
                  <input className="form-input" value={delConfirm} onChange={(e) => setDelConfirm(e.target.value)} placeholder="DELETE" required />
                </div>
                <div className="flex gap-3">
                  <button type="submit" className="btn btn-danger" disabled={deleting || delConfirm !== 'DELETE'}>
                    {deleting ? 'Deleting...' : 'Permanently Delete Account'}
                  </button>
                  <button type="button" onClick={() => { setShowDelDialog(false); setDelPassword(''); setDelConfirm(''); }} className="btn btn-secondary">Cancel</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Create Key Modal */}
      <Modal open={showKeyCreate} onClose={() => setShowKeyCreate(false)} title="Create API Key">
        <form onSubmit={handleCreateKey}>
          <label className="form-label" htmlFor="account-key-name">Key Name</label>
          <input id="account-key-name" className="form-input mb-4" placeholder="e.g., Production Key" value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} required />
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setShowKeyCreate(false)} className="btn btn-secondary">Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={creatingKey}>
              {creatingKey && <span className="btn-spinner" />}
              {creatingKey ? 'Creating...' : 'Create Key'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Revoke-all sessions confirmation */}
      <ConfirmDialog
        open={showRevokeAll}
        onClose={() => setShowRevokeAll(false)}
        onConfirm={handleRevokeAll}
        title="Revoke all other sessions?"
        message="Every device except this one will be signed out. You will remain logged in here."
        confirmLabel="Revoke All"
        danger
      />

      {/* Revoke API key confirmation */}
      <ConfirmDialog
        open={!!revokeKeyTarget}
        onClose={() => setRevokeKeyTarget(null)}
        onConfirm={() => handleRevokeKey(revokeKeyTarget)}
        title="Revoke API key?"
        message={`Revoke API key "${revokeKeyTarget?.name}"? Applications using it will stop working.`}
        confirmLabel="Revoke"
        danger
      />
    </div>
  );
}
