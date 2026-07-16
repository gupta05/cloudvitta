import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../api/client';
import { formatCurrency } from '../../lib/currency';
import { toast } from 'sonner';
import PageHeader from '../../components/ui/PageHeader';

export default function SubscriptionCreate() {
  const navigate = useNavigate();
  const [customers, setCustomers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [form, setForm] = useState({ customerId: '', planVersionId: '', couponId: '', billingDay: new Date().getDate() });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([api.getCustomers('perPage=100'), api.getPlans('status=ACTIVE'), api.getCoupons()])
      .then(([c, p, co]) => { setCustomers(c.data); setPlans(p.data); setCoupons(co.data.filter((c) => c.isActive)); })
      .catch((err) => toast.error(err.message || 'Failed to load form data'));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.customerId || !form.planVersionId) { toast.error('Customer and plan are required'); return; }
    setLoading(true);
    try {
      const sub = await api.createSubscription({ ...form, billingStartDate: new Date().toISOString(), billingDay: parseInt(form.billingDay) });
      toast.success('Subscription created!');
      navigate(`/subscriptions/${sub.id}`);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  // Flatten plans to get plan version options
  const planOptions = plans.flatMap((p) =>
    (p.versions || []).filter((v) => v.isActive || true).map((v) => ({
      id: v.id, label: `${p.name} v${v.version} (${v.billingPeriod})`, trialDays: v.trialDays,
    }))
  );

  // If no versions, use the plan itself
  const allPlanVersions = planOptions.length > 0 ? planOptions : plans.map((p) => ({
    id: p.versions?.[0]?.id, label: p.name,
  })).filter((p) => p.id);

  return (
    <div className="max-w-xl">
      <PageHeader title="New Subscription" backTo="/subscriptions" />
      <div className="glass-card p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="form-label" htmlFor="sub-customer">Customer *</label>
            <select id="sub-customer" className="form-input" value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} required>
              <option value="">Select customer...</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.email || c.alias || '—'})</option>)}
            </select>
          </div>
          <div><label className="form-label" htmlFor="sub-plan">Plan *</label>
            <select id="sub-plan" className="form-input" value={form.planVersionId} onChange={(e) => setForm({ ...form, planVersionId: e.target.value })} required>
              <option value="">Select plan...</option>
              {allPlanVersions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div><label className="form-label" htmlFor="sub-billing-day">Billing Day of Month</label>
            <input id="sub-billing-day" type="number" className="form-input" value={form.billingDay} onChange={(e) => setForm({ ...form, billingDay: e.target.value })} min="1" max="28" />
          </div>
          <div><label className="form-label" htmlFor="sub-coupon">Coupon (optional)</label>
            <select id="sub-coupon" className="form-input" value={form.couponId} onChange={(e) => setForm({ ...form, couponId: e.target.value })}>
              <option value="">None</option>
              {coupons.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.discountType === 'PERCENTAGE' ? `${c.discountValue}%` : formatCurrency(c.discountValue)} off</option>)}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading && <span className="btn-spinner" />}
              {loading ? 'Creating...' : 'Create Subscription'}
            </button>
            <Link to="/subscriptions" className="btn btn-secondary">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
