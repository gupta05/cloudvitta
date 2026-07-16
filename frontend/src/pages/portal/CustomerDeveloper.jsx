import { useEffect, useState } from 'react';
import { Code2, Key, Plus, Copy, Check, X, Shield } from 'lucide-react';
import api from '../../api/client';
import ErrorBanner from '../../components/ui/ErrorBanner';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { formatDate } from '../../lib/format';
import { toast } from 'sonner';

// HTTP method → badge classes
const METHOD_BADGES = {
  GET: 'bg-cv-success/10 text-cv-success',
  POST: 'bg-cv-primary/10 text-cv-primary',
  DELETE: 'bg-cv-danger/10 text-cv-danger',
};

function ApiEndpoint({ method, path, desc, curl }) {
  return (
    <div className="p-4 rounded-lg bg-cv-bg border border-cv-border">
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${METHOD_BADGES[method] || METHOD_BADGES.GET}`}>{method}</span>
        <span className="text-sm font-mono text-cv-text">{path}</span>
      </div>
      <p className="text-xs text-cv-text-muted mb-2">{desc}</p>
      <pre className="text-xs font-mono text-cv-text-secondary bg-cv-surface p-3 rounded overflow-x-auto border border-cv-border">{curl}</pre>
    </div>
  );
}

export default function CustomerDeveloper() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState(null);
  const [copied, setCopied] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState(null);

  const fetchKeys = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getPortalApiKeys();
      setKeys(res?.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchKeys(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const result = await api.createPortalApiKey({ name: newName.trim() });
      setNewToken(result.rawToken);
      setNewName('');
      setShowCreate(false);
      fetchKeys();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (key) => {
    try {
      await api.revokePortalApiKey(key.id);
      toast.success('API key revoked');
      fetchKeys();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success('Copied to clipboard');
  };

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} onRetry={fetchKeys} />;

  const endpoints = [
    {
      method: 'GET', path: '/api/storage/buckets', desc: 'List all your storage buckets',
      curl: `curl -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "x-tenant-id: YOUR_TENANT_ID" \\\n  ${window.location.origin}/api/storage/buckets`,
    },
    {
      method: 'POST', path: '/api/storage/buckets/:id/objects', desc: 'Upload a file to a bucket',
      curl: `curl -X POST -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "x-tenant-id: YOUR_TENANT_ID" \\\n  -F "file=@./my-file.txt" -F "key=my-file.txt" \\\n  ${window.location.origin}/api/storage/buckets/BUCKET_ID/objects`,
    },
    {
      method: 'GET', path: '/api/storage/buckets/:id/objects/:objectId', desc: 'Download a file from a bucket',
      curl: `curl -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "x-tenant-id: YOUR_TENANT_ID" \\\n  -o output.txt \\\n  ${window.location.origin}/api/storage/buckets/BUCKET_ID/objects/OBJECT_ID`,
    },
    {
      method: 'GET', path: '/api/storage/buckets/:id/objects', desc: 'List all files in a bucket',
      curl: `curl -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "x-tenant-id: YOUR_TENANT_ID" \\\n  ${window.location.origin}/api/storage/buckets/BUCKET_ID/objects`,
    },
    {
      method: 'DELETE', path: '/api/storage/buckets/:id/objects/:objectId', desc: 'Delete a file from a bucket',
      curl: `curl -X DELETE -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "x-tenant-id: YOUR_TENANT_ID" \\\n  ${window.location.origin}/api/storage/buckets/BUCKET_ID/objects/OBJECT_ID`,
    },
  ];

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-cv-text">Developer</h1>
          <p className="text-cv-text-secondary text-sm mt-1">API keys and documentation</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn btn-primary">
          <Plus size={16} /> Create API Key
        </button>
      </div>

      {/* New Token Banner */}
      {newToken && (
        <div className="glass-card p-5 mb-6 border-cv-warning" role="alert">
          <div className="flex items-start gap-3">
            <Shield size={20} className="text-cv-warning flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-bold text-cv-warning mb-1">Save your API key</h4>
              <p className="text-xs text-cv-text-muted mb-3">This key will only be shown once. Copy it now and store it securely.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-cv-bg px-3 py-2 rounded-md text-cv-text border border-cv-border break-all">{newToken}</code>
                <button onClick={() => copyToClipboard(newToken)} className="btn btn-secondary flex-shrink-0" aria-label="Copy API key to clipboard">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
            <button onClick={() => setNewToken(null)} className="icon-btn" aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* API Keys Table */}
      <div className="glass-card overflow-hidden mb-8">
        <div className="px-5 py-4 border-b border-cv-border">
          <h3 className="text-sm font-semibold text-cv-text flex items-center gap-2">
            <Key size={16} className="text-cv-accent" /> API Keys
          </h3>
        </div>
        {keys.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Key Prefix</th>
                <th>Status</th>
                <th>Created</th>
                <th>Last Used</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id}>
                  <td className="font-medium">{key.name}</td>
                  <td className="font-mono text-cv-text-secondary">{key.prefix}••••••••</td>
                  <td>
                    <span className={`badge ${key.isActive ? 'badge-active' : 'badge-cancelled'}`}>
                      {key.isActive ? 'Active' : 'Revoked'}
                    </span>
                  </td>
                  <td className="text-cv-text-muted">{formatDate(key.createdAt)}</td>
                  <td className="text-cv-text-muted">{key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Never'}</td>
                  <td>
                    {key.isActive && (
                      <button onClick={() => setRevokeTarget(key)} className="text-cv-danger hover:text-cv-danger/80 text-xs font-medium">
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-4">
            <EmptyState
              icon={Key}
              message="No API keys yet"
              compact
              action={
                <button onClick={() => setShowCreate(true)} className="btn btn-primary">
                  <Plus size={14} /> Create Your First Key
                </button>
              }
            />
          </div>
        )}
      </div>

      {/* API Documentation */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-semibold text-cv-text mb-4 flex items-center gap-2">
          <Code2 size={16} className="text-cv-accent" /> API Reference
        </h3>
        <p className="text-sm text-cv-text-muted mb-4">Use your API key in the <code className="text-xs bg-cv-bg px-1.5 py-0.5 rounded border border-cv-border font-mono">Authorization</code> header as a Bearer token.</p>

        <div className="space-y-4">
          {endpoints.map((ep) => (
            <ApiEndpoint key={`${ep.method} ${ep.path} ${ep.desc}`} {...ep} />
          ))}
        </div>
      </div>

      {/* Create Key Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create API Key">
        <form onSubmit={handleCreate}>
          <label className="form-label" htmlFor="api-key-name">Key Name</label>
          <input
            id="api-key-name"
            type="text"
            className="form-input mb-1"
            placeholder="e.g., Production Key"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            required
          />
          <p className="text-xs text-cv-text-muted mb-4">Give it a descriptive name so you can identify it later.</p>
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={() => setShowCreate(false)} className="btn btn-secondary">Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={creating}>
              {creating && <span className="btn-spinner" />}
              {creating ? 'Creating...' : 'Create Key'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Revoke confirmation */}
      <ConfirmDialog
        open={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => handleRevoke(revokeTarget)}
        title="Revoke API key?"
        message={`Revoke API key "${revokeTarget?.name}"? Applications using it will stop working. This cannot be undone.`}
        confirmLabel="Revoke"
        danger
      />
    </div>
  );
}
