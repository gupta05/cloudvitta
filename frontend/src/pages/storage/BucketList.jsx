import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FolderOpen, Plus, Trash2, HardDrive } from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';
import { formatBytes, formatDate } from '../../lib/format';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';

export default function BucketList() {
  const [buckets, setBuckets] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', customerId: '', region: 'us-east-1' });
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const isAdmin = api.isAdmin();

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const promises = [api.getBuckets()];
      // Admins need the customer list for the dropdown
      if (isAdmin) promises.push(api.getCustomers());
      const results = await Promise.all(promises);
      setBuckets(results[0].data || []);
      if (isAdmin) setCustomers(results[1].data || []);
    } catch (err) {
      toast.error('Failed to load buckets');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      // End-users don't send customerId — the API auto-scopes it
      const payload = { name: form.name, region: form.region };
      if (isAdmin && form.customerId) payload.customerId = form.customerId;
      await api.createBucket(payload);
      toast.success('Bucket created');
      setShowCreate(false);
      setForm({ name: '', customerId: '', region: 'us-east-1' });
      loadData();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(bucket) {
    try {
      await api.deleteBucket(bucket.id);
      toast.success('Bucket deleted');
      loadData();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (loading) return <LoadingSpinner />;

  // Scale meters relative to the largest bucket (no fixed quota at admin level)
  const maxBucketBytes = Math.max(1, ...buckets.map((b) => b.usedBytes || 0));

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-cv-text">{isAdmin ? 'Storage Buckets' : 'My Buckets'}</h1>
          <p className="text-cv-text-secondary text-sm mt-1">
            {buckets.length} bucket{buckets.length !== 1 ? 's' : ''}
            {isAdmin ? ' across all customers' : ''}
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn btn-primary">
          <Plus size={16} /> Create Bucket
        </button>
      </div>

      {/* Buckets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {buckets.map((bucket) => (
          <Link
            key={bucket.id}
            to={`/storage/buckets/${bucket.id}`}
            className="glass-card p-5 hover:border-cv-primary/50 transition-all duration-200 hover:scale-[1.01] group cursor-pointer"
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="icon-chip">
                  <FolderOpen size={20} className="text-cv-accent" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-cv-text group-hover:text-cv-primary transition-colors">{bucket.name}</h3>
                  {isAdmin && <p className="text-xs text-cv-text-muted">{bucket.customer?.name}</p>}
                </div>
              </div>
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteTarget(bucket); }}
                className="icon-btn icon-btn-danger opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Delete bucket ${bucket.name}`}
              >
                <Trash2 size={14} />
              </button>
            </div>

            {/* Storage meter (relative to largest bucket) */}
            <div className="mb-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-cv-text-secondary">{formatBytes(bucket.usedBytes)} used</span>
                <span className="text-cv-text-muted">{(bucket._count?.objects || bucket.objectCount || 0).toLocaleString()} objects</span>
              </div>
              <div className="storage-meter">
                <div className="storage-meter-fill" style={{ width: `${Math.min(100, ((bucket.usedBytes || 0) / maxBucketBytes) * 100)}%` }} />
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-cv-text-muted">
              <span>{bucket.region}</span>
              <span>{formatDate(bucket.createdAt)}</span>
            </div>
          </Link>
        ))}

        {buckets.length === 0 && (
          <div className="col-span-full">
            <EmptyState
              icon={HardDrive}
              title="No buckets yet"
              message="Create your first bucket to start storing objects"
              action={
                <button onClick={() => setShowCreate(true)} className="btn btn-primary">
                  <Plus size={16} /> Create Bucket
                </button>
              }
            />
          </div>
        )}
      </div>

      {/* Create Modal */}
      <Modal open={showCreate} onClose={() => setShowCreate(false)} title="Create Bucket">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="form-label" htmlFor="bucket-name">Bucket Name</label>
            <input id="bucket-name" type="text" className="form-input" placeholder="my-app-assets" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required pattern="^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$" title="3-63 chars, lowercase, alphanumeric, dots, hyphens" />
            <p className="text-xs text-cv-text-muted mt-1">Lowercase letters, numbers, dots, hyphens (3-63 chars)</p>
          </div>
          {/* Customer dropdown — only shown to admins */}
          {isAdmin && (
            <div>
              <label className="form-label" htmlFor="bucket-customer">Customer</label>
              <select id="bucket-customer" className="form-input" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} required>
                <option value="">Select customer...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label className="form-label" htmlFor="bucket-region">Region</label>
            <select id="bucket-region" className="form-input" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })}>
              <option value="us-east-1">US East (N. Virginia)</option>
              <option value="us-west-2">US West (Oregon)</option>
              <option value="eu-west-1">EU (Ireland)</option>
              <option value="ap-southeast-1">Asia Pacific (Singapore)</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={() => setShowCreate(false)} className="btn btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" className="btn btn-primary flex-1 justify-center" disabled={creating}>
              {creating && <span className="btn-spinner" />}
              {creating ? 'Creating...' : 'Create Bucket'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => handleDelete(deleteTarget)}
        title="Delete bucket?"
        message={`Delete bucket "${deleteTarget?.name}"? All objects inside will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  );
}
