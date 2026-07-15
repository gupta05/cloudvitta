import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Check, X } from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';

export default function PlanDetail() {
  const { id } = useParams();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchPlan = () => api.getPlan(id).then(setPlan).finally(() => setLoading(false));
  useEffect(() => { fetchPlan(); }, [id]);

  const handlePublish = async () => {
    try { await api.publishPlan(id); toast.success('Plan published!'); fetchPlan(); } catch (err) { toast.error(err.message); }
  };

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-cv-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (!plan) return <div className="text-center py-20 text-cv-text-muted">Plan not found</div>;

  const renderPricing = (pricingStr) => {
    try {
      const p = JSON.parse(pricingStr || '{}');
      switch (p.model) {
        case 'flat': return `₹${p.price || 0} flat`;
        case 'per_unit': return `₹${p.unitPrice || 0} / unit`;
        case 'package': return `₹${p.packagePrice || 0} / ${p.packageSize || 1} units`;
        case 'tiered': return `${(p.tiers || []).length} tiers`;
        default: return p.model || 'Unknown';
      }
    } catch {
      return '—';
    }
  };

  return (
    <div>
      <Link to="/plans" className="inline-flex items-center gap-1.5 text-sm text-cv-text-secondary hover:text-cv-text mb-4"><ArrowLeft size={16} /> Back to Plans</Link>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-cv-text">{plan.name}</h1>
          <p className="text-cv-text-secondary text-sm mt-1">{plan.description || 'No description'} • {plan.productFamily?.name}</p>
        </div>
        <div className="flex gap-2">
          <span className={`badge badge-${plan.status === 'ACTIVE' ? 'active' : 'draft'}`}>{plan.status}</span>
          {plan.status === 'DRAFT' && <button className="btn btn-primary btn-sm" onClick={handlePublish}><Check size={14} /> Publish</button>}
        </div>
      </div>

      {/* Versions */}
      {plan.versions?.map((version) => (
        <div key={version.id} className="glass-card p-5 mb-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-semibold text-cv-text">Version {version.version}</h3>
              {version.isActive && <span className="badge badge-active text-xs">Active</span>}
            </div>
            <div className="flex gap-3 text-xs text-cv-text-muted">
              <span>{version.billingPeriod}</span>
              <span>{version.currency}</span>
              {version.trialDays > 0 && <span className="text-cv-info">{version.trialDays} day trial</span>}
            </div>
          </div>

          <table className="data-table">
            <thead>
              <tr><th>Component</th><th>Fee Type</th><th>Pricing Model</th><th>Metric</th></tr>
            </thead>
            <tbody>
              {version.priceComponents?.map((pc) => (
                <tr key={pc.id}>
                  <td className="font-medium">{pc.name}</td>
                  <td><span className="badge badge-finalized text-xs">{pc.feeType}</span></td>
                  <td className="font-mono text-xs">{renderPricing(pc.pricingModel)}</td>
                  <td className="text-cv-text-secondary">{pc.billableMetric ? <span className="font-mono text-xs bg-cv-surface-2 px-2 py-0.5 rounded">{pc.billableMetric.code}</span> : '—'}</td>
                </tr>
              ))}
              {(!version.priceComponents || version.priceComponents.length === 0) && <tr><td colSpan="4" className="text-center py-4 text-cv-text-muted">No price components</td></tr>}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
