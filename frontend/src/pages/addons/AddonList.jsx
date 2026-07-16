import { useEffect, useState } from 'react';
import { Plus, Puzzle } from 'lucide-react';
import api from '../../api/client';
import { formatCurrency } from '../../lib/currency';
import { toast } from 'sonner';
import ErrorBanner from '../../components/ui/ErrorBanner';
import Modal from '../../components/ui/Modal';
import { TableSkeleton } from '../../components/ui/Skeleton';

export default function AddonList() {
  const [addons, setAddons] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', feeType: 'ONETIME', priceCents: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  const fetchAddons = () => {
    setLoading(true);
    setError(null);
    api.getAddons()
      .then((d) => setAddons(d.data))
      .catch((err) => setError(err.message || 'Failed to load add-ons'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAddons(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await api.createAddon({ ...form, priceCents: Math.round(parseFloat(form.priceCents) * 100) });
      toast.success('Add-on created');
      setShowModal(false); setForm({ name: '', description: '', feeType: 'ONETIME', priceCents: '' });
      api.getAddons().then((d) => setAddons(d.data));
    } catch (err) { toast.error(err.message); }
    finally { setCreating(false); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-cv-text">Add-ons</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> New Add-on</button>
      </div>
      <div className="glass-card overflow-hidden">
        {error ? (
          <ErrorBanner message={error} onRetry={fetchAddons} />
        ) : (
        <table className="data-table">
          <thead><tr><th>Name</th><th>Description</th><th>Fee Type</th><th>Price</th><th>Used In</th></tr></thead>
          {loading ? (
            <TableSkeleton rows={5} cols={5} />
          ) : (
            <tbody>
              {addons.length === 0 ? <tr><td colSpan="5" className="text-center py-10"><Puzzle size={32} className="mx-auto mb-2 opacity-30 text-cv-text-muted" /><p className="text-cv-text-muted">No add-ons</p></td></tr> :
                addons.map((a) => (
                  <tr key={a.id}>
                    <td className="font-medium">{a.name}</td>
                    <td className="text-cv-text-secondary text-sm">{a.description || '—'}</td>
                    <td><span className="badge badge-finalized">{a.feeType}</span></td>
                    <td className="font-medium">{formatCurrency(a.priceCents)}</td>
                    <td>{a._count?.subscriptionAddons || 0} subs</td>
                  </tr>
                ))}
            </tbody>
          )}
        </table>
        )}
      </div>

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="New Add-on"
        footer={
          <>
            <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
              {creating && <span className="btn-spinner" />}
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
          </>
        }
      >
        <div className="space-y-3">
          <div><label className="form-label" htmlFor="addon-name">Name</label><input id="addon-name" className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="form-label" htmlFor="addon-desc">Description</label><input id="addon-desc" className="form-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><label className="form-label" htmlFor="addon-fee">Fee Type</label>
            <select id="addon-fee" className="form-input" value={form.feeType} onChange={(e) => setForm({ ...form, feeType: e.target.value })}>
              <option>ONETIME</option><option>RECURRING</option>
            </select>
          </div>
          <div><label className="form-label" htmlFor="addon-price">Price (₹)</label><input id="addon-price" type="number" step="0.01" className="form-input" value={form.priceCents} onChange={(e) => setForm({ ...form, priceCents: e.target.value })} /></div>
        </div>
      </Modal>
    </div>
  );
}
