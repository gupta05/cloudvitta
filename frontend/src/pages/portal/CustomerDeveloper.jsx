import { useEffect, useState } from 'react';
import { Code2, Key, Plus, Copy, Trash2, Check, X, Clock, Shield, ExternalLink } from 'lucide-react';
import api from '../../api/client';
import ErrorBanner from '../../components/ui/ErrorBanner';
import { toast } from 'sonner';

export default function CustomerDeveloper() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState(null);
  const [copied, setCopied] = useState(false);

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

  const handleRevoke = async (id, name) => {
    if (!confirm(`Revoke API key "${name}"? This cannot be undone.`)) return;
    try {
      await api.revokePortalApiKey(id);
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

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-cv-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <ErrorBanner message={error} onRetry={fetchKeys} />;

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
        <div className="glass-card p-5 mb-6 border-cv-warning">
          <div className="flex items-start gap-3">
            <Shield size={20} className="text-cv-warning flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-bold text-cv-warning mb-1">Save your API key</h4>
              <p className="text-xs text-cv-text-muted mb-3">This key will only be shown once. Copy it now and store it securely.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-cv-bg px-3 py-2 rounded-md text-cv-text border border-cv-border break-all">{newToken}</code>
                <button onClick={() => copyToClipboard(newToken)} className="btn btn-secondary flex-shrink-0">
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
            <button onClick={() => setNewToken(null)} className="text-cv-text-muted hover:text-cv-text"><X size={16} /></button>
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
                  <td className="text-cv-text-muted">{new Date(key.createdAt).toLocaleDateString()}</td>
                  <td className="text-cv-text-muted">
                    {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}
                  </td>
                  <td>
                    {key.isActive && (
                      <button onClick={() => handleRevoke(key.id, key.name)} className="text-cv-danger hover:text-red-400 text-xs font-medium">
                        Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center">
            <Key size={32} className="mx-auto mb-3 text-cv-text-muted opacity-30" />
            <p className="text-sm text-cv-text-muted">No API keys yet</p>
            <button onClick={() => setShowCreate(true)} className="btn btn-primary mt-3">
              <Plus size={14} /> Create Your First Key
            </button>
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
          {/* List Buckets */}
          <div className="p-4 rounded-lg bg-cv-bg border border-cv-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded">GET</span>
                <span className="text-sm font-mono text-cv-text">/api/storage/buckets</span>
              </div>
            </div>
            <p className="text-xs text-cv-text-muted mb-2">List all your storage buckets</p>
            <pre className="text-xs font-mono text-cv-text-secondary bg-zinc-900 p-3 rounded overflow-x-auto border border-zinc-800">{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "x-tenant-id: YOUR_TENANT_ID" \\
  ${window.location.origin}/api/storage/buckets`}</pre>
          </div>

          {/* Upload Object */}
          <div className="p-4 rounded-lg bg-cv-bg border border-cv-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold bg-blue-500/10 text-blue-400 px-2 py-0.5 rounded">POST</span>
                <span className="text-sm font-mono text-cv-text">/api/storage/buckets/:id/objects</span>
              </div>
            </div>
            <p className="text-xs text-cv-text-muted mb-2">Upload a file to a bucket</p>
            <pre className="text-xs font-mono text-cv-text-secondary bg-zinc-900 p-3 rounded overflow-x-auto border border-zinc-800">{`curl -X POST -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "x-tenant-id: YOUR_TENANT_ID" \\
  -F "file=@./my-file.txt" -F "key=my-file.txt" \\
  ${window.location.origin}/api/storage/buckets/BUCKET_ID/objects`}</pre>
          </div>

          {/* Download Object */}
          <div className="p-4 rounded-lg bg-cv-bg border border-cv-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded">GET</span>
                <span className="text-sm font-mono text-cv-text">/api/storage/buckets/:id/objects/:objectId</span>
              </div>
            </div>
            <p className="text-xs text-cv-text-muted mb-2">Download a file from a bucket</p>
            <pre className="text-xs font-mono text-cv-text-secondary bg-zinc-900 p-3 rounded overflow-x-auto border border-zinc-800">{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "x-tenant-id: YOUR_TENANT_ID" \\
  -o output.txt \\
  ${window.location.origin}/api/storage/buckets/BUCKET_ID/objects/OBJECT_ID`}</pre>
          </div>

          {/* List Objects */}
          <div className="p-4 rounded-lg bg-cv-bg border border-cv-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded">GET</span>
                <span className="text-sm font-mono text-cv-text">/api/storage/buckets/:id/objects</span>
              </div>
            </div>
            <p className="text-xs text-cv-text-muted mb-2">List all files in a bucket</p>
            <pre className="text-xs font-mono text-cv-text-secondary bg-zinc-900 p-3 rounded overflow-x-auto border border-zinc-800">{`curl -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "x-tenant-id: YOUR_TENANT_ID" \\
  ${window.location.origin}/api/storage/buckets/BUCKET_ID/objects`}</pre>
          </div>

          {/* Delete Object */}
          <div className="p-4 rounded-lg bg-cv-bg border border-cv-border">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold bg-red-500/10 text-red-400 px-2 py-0.5 rounded">DELETE</span>
                <span className="text-sm font-mono text-cv-text">/api/storage/buckets/:id/objects/:objectId</span>
              </div>
            </div>
            <p className="text-xs text-cv-text-muted mb-2">Delete a file from a bucket</p>
            <pre className="text-xs font-mono text-cv-text-secondary bg-zinc-900 p-3 rounded overflow-x-auto border border-zinc-800">{`curl -X DELETE -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "x-tenant-id: YOUR_TENANT_ID" \\
  ${window.location.origin}/api/storage/buckets/BUCKET_ID/objects/OBJECT_ID`}</pre>
          </div>
        </div>
      </div>

      {/* Create Key Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="glass-card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-cv-text">Create API Key</h3>
              <button onClick={() => setShowCreate(false)} className="text-cv-text-muted hover:text-cv-text"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <label className="form-label">Key Name</label>
              <input
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
                  {creating ? 'Creating...' : 'Create Key'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
