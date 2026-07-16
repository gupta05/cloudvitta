import { useEffect, useState } from 'react';
import { Plus, Tags } from 'lucide-react';
import api from '../../api/client';
import { formatCurrency } from '../../lib/currency';
import { formatDate } from '../../lib/format';
import { toast } from 'sonner';
import ErrorBanner from '../../components/ui/ErrorBanner';
import Modal from '../../components/ui/Modal';
import { TableSkeleton } from '../../components/ui/Skeleton';

export default function CouponList() {
  const [coupons, setCoupons] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ code: '', description: '', discountType: 'PERCENTAGE', discountValue: '', maxRedemptions: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);

  const fetchCoupons = () => {
    setLoading(true);
    setError(null);
    api.getCoupons()
      .then((d) => setCoupons(d.data))
      .catch((err) => setError(err.message || 'Failed to load coupons'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchCoupons(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      await api.createCoupon({ ...form, discountValue: parseFloat(form.discountValue), maxRedemptions: form.maxRedemptions ? parseInt(form.maxRedemptions) : null });
      toast.success('Coupon created');
      setShowModal(false); setForm({ code: '', description: '', discountType: 'PERCENTAGE', discountValue: '', maxRedemptions: '' });
      api.getCoupons().then((d) => setCoupons(d.data));
    } catch (err) { toast.error(err.message); }
    finally { setCreating(false); }
  };

  const toggleCoupon = async (id, isActive) => {
    try {
      await api.updateCoupon(id, { isActive: !isActive });
      api.getCoupons().then((d) => setCoupons(d.data));
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-cv-text">Coupons</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> New Coupon</button>
      </div>
      <div className="glass-card overflow-hidden">
        {error ? (
          <ErrorBanner message={error} onRetry={fetchCoupons} />
        ) : (
        <table className="data-table">
          <thead><tr><th>Code</th><th>Discount</th><th>Redemptions</th><th>Status</th><th>Expires</th><th>Actions</th></tr></thead>
          {loading ? (
            <TableSkeleton rows={5} cols={6} />
          ) : (
            <tbody>
              {coupons.length === 0 ? <tr><td colSpan="6" className="text-center py-10"><Tags size={32} className="mx-auto mb-2 opacity-30 text-cv-text-muted" /><p className="text-cv-text-muted">No coupons</p></td></tr> :
                coupons.map((c) => (
                  <tr key={c.id}>
                    <td><span className="font-mono font-bold text-cv-primary">{c.code}</span></td>
                    <td>{c.discountType === 'PERCENTAGE' ? `${c.discountValue}%` : formatCurrency(c.discountValue)} <span className="text-xs text-cv-text-muted">({c.discountType})</span></td>
                    <td>{c.timesRedeemed}{c.maxRedemptions ? ` / ${c.maxRedemptions}` : ''}</td>
                    <td><span className={`badge ${c.isActive ? 'badge-active' : 'badge-cancelled'}`}>{c.isActive ? 'Active' : 'Disabled'}</span></td>
                    <td className="text-cv-text-secondary text-sm">{c.expiresAt ? formatDate(c.expiresAt) : 'Never'}</td>
                    <td><button className="btn btn-ghost btn-sm" onClick={() => toggleCoupon(c.id, c.isActive)}>{c.isActive ? 'Disable' : 'Enable'}</button></td>
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
        title="New Coupon"
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
          <div><label className="form-label" htmlFor="coupon-code">Code</label><input id="coupon-code" className="form-input font-mono uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="WELCOME20" /></div>
          <div><label className="form-label" htmlFor="coupon-desc">Description</label><input id="coupon-desc" className="form-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div><label className="form-label" htmlFor="coupon-type">Discount Type</label>
            <select id="coupon-type" className="form-input" value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}>
              <option>PERCENTAGE</option><option>FIXED_AMOUNT</option>
            </select>
          </div>
          <div><label className="form-label" htmlFor="coupon-value">{form.discountType === 'PERCENTAGE' ? 'Percentage (0-100)' : 'Amount (paise)'}</label><input id="coupon-value" type="number" className="form-input" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} /></div>
          <div><label className="form-label" htmlFor="coupon-max">Max Redemptions</label><input id="coupon-max" type="number" className="form-input" placeholder="Unlimited" value={form.maxRedemptions} onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })} /></div>
        </div>
      </Modal>
    </div>
  );
}
