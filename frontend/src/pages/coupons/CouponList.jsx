import { useEffect, useState } from 'react';
import { Plus, Tags } from 'lucide-react';
import api from '../../api/client';
import { formatCurrency } from '../../lib/currency';
import { toast } from 'sonner';
import ErrorBanner from '../../components/ui/ErrorBanner';

export default function CouponList() {
  const [coupons, setCoupons] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ code: '', description: '', discountType: 'PERCENTAGE', discountValue: '', maxRedemptions: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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
    try {
      await api.createCoupon({ ...form, discountValue: parseFloat(form.discountValue), maxRedemptions: form.maxRedemptions ? parseInt(form.maxRedemptions) : null });
      toast.success('Coupon created');
      setShowModal(false); setForm({ code: '', description: '', discountType: 'PERCENTAGE', discountValue: '', maxRedemptions: '' });
      api.getCoupons().then((d) => setCoupons(d.data));
    } catch (err) { toast.error(err.message); }
  };

  const toggleCoupon = async (id, isActive) => {
    await api.updateCoupon(id, { isActive: !isActive });
    api.getCoupons().then((d) => setCoupons(d.data));
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-cv-text">Coupons</h1>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}><Plus size={16} /> New Coupon</button>
      </div>
      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-10"><div className="w-6 h-6 border-2 border-cv-primary border-t-transparent rounded-full animate-spin" /></div>
        ) : error ? (
          <ErrorBanner message={error} onRetry={fetchCoupons} />
        ) : (
        <table className="data-table">
          <thead><tr><th>Code</th><th>Discount</th><th>Redemptions</th><th>Status</th><th>Expires</th><th>Actions</th></tr></thead>
          <tbody>
            {coupons.length === 0 ? <tr><td colSpan="6" className="text-center py-10"><Tags size={32} className="mx-auto mb-2 opacity-30 text-cv-text-muted" /><p className="text-cv-text-muted">No coupons</p></td></tr> :
              coupons.map((c) => (
                <tr key={c.id}>
                  <td><span className="font-mono font-bold text-cv-primary">{c.code}</span></td>
                  <td>{c.discountType === 'PERCENTAGE' ? `${c.discountValue}%` : formatCurrency(c.discountValue)} <span className="text-xs text-cv-text-muted">({c.discountType})</span></td>
                  <td>{c.timesRedeemed}{c.maxRedemptions ? ` / ${c.maxRedemptions}` : ''}</td>
                  <td><span className={`badge ${c.isActive ? 'badge-active' : 'badge-cancelled'}`}>{c.isActive ? 'Active' : 'Disabled'}</span></td>
                  <td className="text-cv-text-secondary text-sm">{c.expiresAt ? new Date(c.expiresAt).toLocaleDateString() : 'Never'}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => toggleCoupon(c.id, c.isActive)}>{c.isActive ? 'Disable' : 'Enable'}</button></td>
                </tr>
              ))}
          </tbody>
        </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in" onClick={() => setShowModal(false)}>
          <div className="glass-card p-6 w-full max-w-md glow-primary" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-cv-text mb-4">New Coupon</h3>
            <div className="space-y-3">
              <div><label className="form-label">Code</label><input className="form-input font-mono uppercase" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="WELCOME20" /></div>
              <div><label className="form-label">Description</label><input className="form-input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div><label className="form-label">Discount Type</label>
                <select className="form-input" value={form.discountType} onChange={(e) => setForm({ ...form, discountType: e.target.value })}>
                  <option>PERCENTAGE</option><option>FIXED_AMOUNT</option>
                </select>
              </div>
              <div><label className="form-label">{form.discountType === 'PERCENTAGE' ? 'Percentage (0-100)' : 'Amount (cents)'}</label><input type="number" className="form-input" value={form.discountValue} onChange={(e) => setForm({ ...form, discountValue: e.target.value })} /></div>
              <div><label className="form-label">Max Redemptions</label><input type="number" className="form-input" placeholder="Unlimited" value={form.maxRedemptions} onChange={(e) => setForm({ ...form, maxRedemptions: e.target.value })} /></div>
            </div>
            <div className="flex gap-3 mt-5">
              <button className="btn btn-primary" onClick={handleCreate}>Create</button>
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
