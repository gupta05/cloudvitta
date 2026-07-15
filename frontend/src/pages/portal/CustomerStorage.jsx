import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderOpen, Plus, Trash2, HardDrive, X } from 'lucide-react';
import api from '../../api/client';
import ErrorBanner from '../../components/ui/ErrorBanner';
import { toast } from 'sonner';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export default function CustomerStorage() {
  const [buckets, setBuckets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchBuckets = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getBuckets();
      setBuckets(res?.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load buckets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchBuckets(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await api.createBucket({ name: newName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-') });
      toast.success('Bucket created');
      setNewName('');
      setShowCreate(false);
      fetchBuckets();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (bucketId, name) => {
    if (!confirm(`Delete bucket "${name}"? This cannot be undone.`)) return;
    try {
      await api.deleteBucket(bucketId);
      toast.success('Bucket deleted');
      fetchBuckets();
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-cv-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <ErrorBanner message={error} onRetry={fetchBuckets} />;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-cv-text">My Storage</h1>
          <p className="text-cv-text-secondary text-sm mt-1">{buckets.length} bucket{buckets.length !== 1 ? 's' : ''} • {formatBytes(buckets.reduce((s, b) => s + Number(b.usedBytes || 0), 0))} total</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn btn-primary">
          <Plus size={16} /> New Bucket
        </button>
      </div>

      {/* Bucket Grid */}
      {buckets.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(() => { const maxBucketBytes = Math.max(1, ...buckets.map((b) => Number(b.usedBytes || 0))); return buckets.map((bucket) => {
            // Fill against the bucket's own quota when set; otherwise scale relative to the largest bucket.
            const used = Number(bucket.usedBytes || 0);
            const denom = bucket.quotaBytes ? Number(bucket.quotaBytes) : maxBucketBytes;
            const fillPct = Math.min(100, denom > 0 ? (used / denom) * 100 : 0);
            return (
            <div key={bucket.id} className="glass-card p-5 hover:border-cv-border-light transition-colors group">
              <div className="flex items-start justify-between mb-3">
                <Link to={`/portal/storage/${bucket.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-zinc-800 border border-zinc-700 group-hover:bg-zinc-700 transition-colors">
                    <FolderOpen size={20} className="text-cv-accent" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-cv-text group-hover:text-cv-primary transition-colors truncate">{bucket.name}</h3>
                    <p className="text-xs text-cv-text-muted">{bucket.objectCount || 0} objects</p>
                  </div>
                </Link>
                <button onClick={() => handleDelete(bucket.id, bucket.name)} className="p-1.5 rounded-md text-cv-text-muted hover:text-cv-danger hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-cv-text-secondary font-mono">{formatBytes(Number(bucket.usedBytes || 0))}</span>
                <span className="text-cv-text-muted">{new Date(bucket.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="mt-2 storage-meter">
                <div className="storage-meter-fill" style={{ width: `${fillPct}%` }} />
              </div>
            </div>
            );
          }); })()}
        </div>
      ) : (
        <div className="glass-card p-12 text-center">
          <HardDrive size={48} className="mx-auto mb-4 text-cv-text-muted opacity-30" />
          <h3 className="text-lg font-semibold text-cv-text mb-2">No buckets yet</h3>
          <p className="text-sm text-cv-text-muted mb-4">Create your first bucket to start storing files</p>
          <button onClick={() => setShowCreate(true)} className="btn btn-primary">
            <Plus size={16} /> Create Bucket
          </button>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowCreate(false)}>
          <div className="glass-card p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-cv-text">Create Bucket</h3>
              <button onClick={() => setShowCreate(false)} className="text-cv-text-muted hover:text-cv-text"><X size={18} /></button>
            </div>
            <form onSubmit={handleCreate}>
              <label className="form-label">Bucket Name</label>
              <input
                type="text"
                className="form-input mb-4"
                placeholder="my-files"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                pattern="[a-z0-9][a-z0-9-]*[a-z0-9]"
                title="Lowercase letters, numbers, and hyphens only"
                required
              />
              <p className="text-xs text-cv-text-muted mb-4">Use lowercase letters, numbers, and hyphens. Minimum 3 characters.</p>
              <div className="flex gap-3 justify-end">
                <button type="button" onClick={() => setShowCreate(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating}>
                  {creating ? 'Creating...' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
