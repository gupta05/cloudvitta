import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Plus, Trash2 } from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';
import PageHeader from '../../components/ui/PageHeader';

const FEE_TYPES = ['RECURRING', 'USAGE', 'ONETIME', 'SLOT', 'CAPACITY', 'RATE'];
const PRICING_MODELS = ['flat', 'per_unit', 'tiered', 'package'];

export default function PlanBuilder() {
  const navigate = useNavigate();
  const [families, setFamilies] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [loading, setLoading] = useState(false);

  const [plan, setPlan] = useState({ name: '', description: '', productFamilyId: '', planType: 'STANDARD', billingPeriod: 'MONTHLY', trialDays: 0, currency: 'INR' });
  const [components, setComponents] = useState([]);

  useEffect(() => {
    Promise.all([api.getProductFamilies(), api.getBillableMetrics()])
      .then(([f, m]) => { setFamilies(f.data); setMetrics(m.data); })
      .catch((err) => toast.error(err.message || 'Failed to load catalog data'));
  }, []);

  const addComponent = () => {
    setComponents([...components, { name: '', feeType: 'RECURRING', pricingModel: { model: 'flat', price: 0 }, billableMetricId: '' }]);
  };

  const updateComponent = (index, field, value) => {
    const updated = [...components];
    if (field.startsWith('pricingModel.')) {
      const key = field.split('.')[1];
      updated[index].pricingModel = { ...updated[index].pricingModel, [key]: value };
    } else {
      updated[index][field] = value;
    }
    setComponents(updated);
  };

  const removeComponent = (index) => setComponents(components.filter((_, i) => i !== index));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!plan.name || !plan.productFamilyId) { toast.error('Name and product family are required'); return; }
    setLoading(true);
    try {
      const result = await api.createPlan({
        ...plan,
        trialDays: parseInt(plan.trialDays) || 0,
        priceComponents: components.map((c) => ({
          name: c.name,
          feeType: c.feeType,
          pricingModel: c.pricingModel,
          billableMetricId: c.billableMetricId || null,
        })),
      });
      toast.success('Plan created!');
      navigate(`/plans/${result.id}`);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-3xl">
      <PageHeader title="Create Plan" backTo="/plans" />

      <form onSubmit={handleSubmit}>
        {/* Basic Info */}
        <div className="glass-card p-6 mb-6">
          <h3 className="text-sm font-semibold text-cv-text mb-4">Plan Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><label className="form-label" htmlFor="plan-name">Name *</label><input id="plan-name" className="form-input" value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} required /></div>
            <div className="sm:col-span-2"><label className="form-label" htmlFor="plan-desc">Description</label><input id="plan-desc" className="form-input" value={plan.description} onChange={(e) => setPlan({ ...plan, description: e.target.value })} /></div>
            <div><label className="form-label" htmlFor="plan-family">Product Family *</label>
              <select id="plan-family" className="form-input" value={plan.productFamilyId} onChange={(e) => setPlan({ ...plan, productFamilyId: e.target.value })} required>
                <option value="">Select...</option>
                {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div><label className="form-label" htmlFor="plan-type">Plan Type</label>
              <select id="plan-type" className="form-input" value={plan.planType} onChange={(e) => setPlan({ ...plan, planType: e.target.value })}>
                <option>STANDARD</option><option>FREE</option><option>CUSTOM</option>
              </select>
            </div>
            <div><label className="form-label" htmlFor="plan-period">Billing Period</label>
              <select id="plan-period" className="form-input" value={plan.billingPeriod} onChange={(e) => setPlan({ ...plan, billingPeriod: e.target.value })}>
                <option>MONTHLY</option><option>QUARTERLY</option><option>ANNUAL</option>
              </select>
            </div>
            <div><label className="form-label" htmlFor="plan-trial">Trial Days</label><input id="plan-trial" type="number" className="form-input" value={plan.trialDays} onChange={(e) => setPlan({ ...plan, trialDays: e.target.value })} min="0" /></div>
          </div>
        </div>

        {/* Price Components */}
        <div className="glass-card p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-cv-text">Price Components</h3>
            <button type="button" onClick={addComponent} className="btn btn-secondary btn-sm"><Plus size={14} /> Add Component</button>
          </div>

          {components.length === 0 && <p className="text-sm text-cv-text-muted text-center py-6">No price components yet. Add one to define pricing.</p>}

          <div className="space-y-4">
            {components.map((comp, i) => (
              <div key={i} className="p-4 rounded-lg border border-cv-border bg-cv-surface-2 animate-slide-in">
                <div className="flex items-start gap-3">
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="form-label text-xs">Component Name</label><input className="form-input" placeholder="Platform Fee" value={comp.name} onChange={(e) => updateComponent(i, 'name', e.target.value)} /></div>
                    <div><label className="form-label text-xs">Fee Type</label>
                      <select className="form-input" value={comp.feeType} onChange={(e) => updateComponent(i, 'feeType', e.target.value)}>
                        {FEE_TYPES.map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div><label className="form-label text-xs">Pricing Model</label>
                      <select className="form-input" value={comp.pricingModel.model} onChange={(e) => updateComponent(i, 'pricingModel.model', e.target.value)}>
                        {PRICING_MODELS.map((m) => <option key={m}>{m}</option>)}
                      </select>
                    </div>
                    {comp.pricingModel.model === 'flat' && (
                      <div><label className="form-label text-xs">Price (₹)</label><input type="number" step="0.01" className="form-input" value={comp.pricingModel.price || ''} onChange={(e) => updateComponent(i, 'pricingModel.price', parseFloat(e.target.value) || 0)} /></div>
                    )}
                    {comp.pricingModel.model === 'per_unit' && (
                      <div><label className="form-label text-xs">Unit Price (₹)</label><input type="number" step="0.0001" className="form-input" value={comp.pricingModel.unitPrice || ''} onChange={(e) => updateComponent(i, 'pricingModel.unitPrice', parseFloat(e.target.value) || 0)} /></div>
                    )}
                    {comp.pricingModel.model === 'package' && (
                      <>
                        <div><label className="form-label text-xs">Package Size</label><input type="number" className="form-input" value={comp.pricingModel.packageSize || ''} onChange={(e) => updateComponent(i, 'pricingModel.packageSize', parseInt(e.target.value) || 1)} /></div>
                        <div><label className="form-label text-xs">Package Price (₹)</label><input type="number" step="0.01" className="form-input" value={comp.pricingModel.packagePrice || ''} onChange={(e) => updateComponent(i, 'pricingModel.packagePrice', parseFloat(e.target.value) || 0)} /></div>
                      </>
                    )}
                    {['USAGE', 'CAPACITY', 'SLOT'].includes(comp.feeType) && (
                      <div className="sm:col-span-2"><label className="form-label text-xs">Billable Metric</label>
                        <select className="form-input" value={comp.billableMetricId} onChange={(e) => updateComponent(i, 'billableMetricId', e.target.value)}>
                          <option value="">None</option>
                          {metrics.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.code})</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => removeComponent(i)} className="icon-btn icon-btn-danger mt-5" aria-label={`Remove component ${comp.name || i + 1}`}>
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-3">
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading && <span className="btn-spinner" />}
            {loading ? 'Creating...' : 'Create Plan'}
          </button>
          <Link to="/plans" className="btn btn-secondary">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
