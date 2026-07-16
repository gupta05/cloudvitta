import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus, Layers } from 'lucide-react';
import api from '../../api/client';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import EmptyState from '../../components/ui/EmptyState';

export default function PlanList() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.getPlans().then((d) => setPlans(d.data))
      .catch((err) => setError(err.message || 'Failed to load plans'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div><h1 className="text-2xl font-bold text-cv-text">Plans</h1><p className="text-cv-text-secondary text-sm mt-1">Manage pricing plans</p></div>
        <Link to="/plans/new" className="btn btn-primary"><Plus size={16} /> Create Plan</Link>
      </div>
      {error && <p className="text-sm text-cv-danger mb-4" role="alert">{error}</p>}
      {loading ? <LoadingSpinner /> :
        plans.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No plans yet"
            message="Create your first pricing plan to get started."
            action={<Link to="/plans/new" className="btn btn-primary"><Plus size={16} /> Create Plan</Link>}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const activeVersion = plan.versions?.[0];
              return (
                <div key={plan.id} className="glass-card p-5 hover:scale-[1.02] transition-transform cursor-pointer" onClick={() => navigate(`/plans/${plan.id}`)}>
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-lg font-bold text-cv-text">{plan.name}</h3>
                    <span className={`badge badge-${plan.status === 'ACTIVE' ? 'active' : plan.status === 'DRAFT' ? 'draft' : 'cancelled'}`}>{plan.status}</span>
                  </div>
                  <p className="text-sm text-cv-text-secondary mb-3">{plan.description || 'No description'}</p>
                  <div className="flex items-center justify-between text-xs text-cv-text-muted">
                    <span>{plan.productFamily?.name}</span>
                    <span>{activeVersion ? `v${activeVersion.version} • ${activeVersion.billingPeriod}` : 'No versions'}</span>
                  </div>
                  {activeVersion && <p className="text-xs text-cv-text-muted mt-1">{activeVersion._count?.priceComponents || 0} price components</p>}
                </div>
              );
            })}
          </div>
        )
      }
    </div>
  );
}
