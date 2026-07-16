import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';
import { formatRupees } from '../../lib/currency';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import PageHeader from '../../components/ui/PageHeader';

export default function PlanDetail() {
  const { id } = useParams();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchPlan = () => api.getPlan(id).then(setPlan).finally(() => setLoading(false));
  useEffect(() => { fetchPlan(); }, [id]);

  const handlePublish = async () => {
    try { await api.publishPlan(id); toast.success('Plan published!'); fetchPlan(); } catch (err) { toast.error(err.message); }
  };

  if (loading) return <LoadingSpinner />;
  if (!plan) return <div className="text-center py-20 text-cv-text-muted">Plan not found</div>;

  const renderPricing = (pricingStr) => {
    try {
      const p = JSON.parse(pricingStr || '{}');
      switch (p.model) {
        case 'flat': return `${formatRupees(p.price || 0)} flat`;
        case 'per_unit': return `${formatRupees(p.unitPrice || 0)} / unit`;
        case 'package': return `${formatRupees(p.packagePrice || 0)} / ${p.packageSize || 1} units`;
        case 'tiered': return `${(p.tiers || []).length} tiers`;
        default: return p.model || 'Unknown';
      }
    } catch {
      return '—';
    }
  };

  return (
    <div>
      <PageHeader
        title={plan.name}
        subtitle={`${plan.description || 'No description'} • ${plan.productFamily?.name}`}
        backTo="/plans"
        actions={
          <>
            <span className={`badge badge-${plan.status === 'ACTIVE' ? 'active' : 'draft'}`}>{plan.status}</span>
            {plan.status === 'DRAFT' && <button className="btn btn-primary btn-sm" onClick={handlePublish}><Check size={14} /> Publish</button>}
          </>
        }
      />

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
