import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Gauge, Users, IndianRupee, FileText, Activity, AlertTriangle, ShieldCheck } from 'lucide-react';
import api from '../../api/client';
import ErrorBanner from '../../components/ui/ErrorBanner';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import StatCard from '../../components/ui/StatCard';
import EmptyState from '../../components/ui/EmptyState';
import { formatCurrency, formatRupees } from '../../lib/currency';
import { formatDate } from '../../lib/format';

// Cycle status → badge class (matches invoice/subscription badge conventions)
const CYCLE_BADGES = {
  OPEN: 'badge-active',
  INVOICING: 'badge-pending',
  INVOICED: 'badge-paid',
  CLOSED: 'badge-void',
};

export default function MeteredBilling() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = () => {
    setLoading(true);
    setError(null);
    api.getMeteredStats()
      .then(setStats)
      .catch((err) => setError(err.message || 'Failed to load metered billing stats'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchStats(); }, []);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} onRetry={fetchStats} />;

  const health = stats?.health || {};
  const revenue = stats?.revenue || {};
  const customers = stats?.customers || [];
  const cycles = stats?.cycles || [];

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-cv-text">Metered Billing</h1>
        <p className="text-cv-text-secondary text-sm mt-1">
          Pay-as-you-go customers, usage-based revenue, billing cycles, and metering health
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Users}
          label="Metered Customers"
          value={stats?.meteredCustomerCount || 0}
          subValue={stats?.blockedCustomerCount > 0 ? `${stats.blockedCustomerCount} blocked (overdue)` : 'All in good standing'}
          accent={stats?.blockedCustomerCount > 0 ? 'danger' : 'primary'}
        />
        <StatCard
          icon={IndianRupee}
          label="Accrued Revenue (Est.)"
          value={formatCurrency(revenue.accruedCents || 0)}
          subValue={`Projected ${formatCurrency(revenue.projectedCents || 0)} at cycle end`}
          accent="success"
        />
        <StatCard
          icon={FileText}
          label="Outstanding Invoiced"
          value={formatCurrency(revenue.outstandingCents || 0)}
          subValue={`${formatCurrency(revenue.paidThisMonthCents || 0)} collected this month`}
          accent={revenue.outstandingCents > 0 ? 'warning' : 'neutral'}
        />
        <StatCard
          icon={Activity}
          label="Metering Health"
          value={health.healthy ? 'Healthy' : health.lastSnapshotAgeMinutes == null ? 'No data' : 'Stale'}
          subValue={health.lastSnapshotAgeMinutes != null
            ? `Last snapshot ${health.lastSnapshotAgeMinutes} min ago · ${(health.snapshots24h || 0).toLocaleString()} in 24h`
            : 'No snapshots recorded yet'}
          accent={health.healthy ? 'success' : 'danger'}
        />
      </div>

      {/* Metered Customers + Cap Enforcement */}
      <div className="glass-card overflow-hidden mb-6">
        <div className="px-5 py-4 border-b border-cv-border flex items-center justify-between">
          <h3 className="text-sm font-semibold text-cv-text flex items-center gap-2">
            <Gauge size={16} className="text-cv-accent" /> Metered Customers
          </h3>
          <span className="text-xs text-cv-text-muted flex items-center gap-1">
            <ShieldCheck size={12} /> 1 GB cap enforced in real time at upload
          </span>
        </div>
        {customers.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Billing Cycle</th>
                <th>Avg Usage</th>
                <th>Storage Cap</th>
                <th>Accrued</th>
                <th>Projected</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.subscriptionId}>
                  <td>
                    <Link to={`/customers/${c.customerId}`} className="font-medium text-cv-primary hover:text-cv-primary-hover">
                      {c.customerName}
                    </Link>
                    <p className="text-xs text-cv-text-muted">{c.customerEmail}</p>
                  </td>
                  <td className="text-cv-text-muted text-xs whitespace-nowrap">
                    {c.periodStart ? `${formatDate(c.periodStart)} — ${formatDate(c.periodEnd)}` : '—'}
                  </td>
                  <td className="font-mono">{(c.avgGBSoFar || 0).toFixed(3)} GB</td>
                  <td>
                    <div className="flex items-center gap-2 min-w-[120px]">
                      <div className="progress-bar flex-1">
                        <div
                          className="progress-bar-fill"
                          style={{
                            width: `${c.capUsagePercent}%`,
                            background: c.atCap ? 'var(--color-cv-danger)' : undefined,
                          }}
                        />
                      </div>
                      <span className={`font-mono text-xs whitespace-nowrap ${c.atCap ? 'text-cv-danger' : 'text-cv-text-muted'}`}>
                        {(c.currentGB || 0).toFixed(2)}/{c.capGB} GB
                      </span>
                    </div>
                  </td>
                  <td className="font-mono">{formatCurrency(c.accruedCents || 0)}</td>
                  <td className="font-mono text-cv-text-muted">{formatCurrency(c.projectedCents || 0)}</td>
                  <td>
                    {c.uploadsBlocked ? (
                      <span className="badge badge-overdue flex items-center gap-1 w-fit">
                        <AlertTriangle size={10} /> Blocked
                      </span>
                    ) : c.atCap ? (
                      <span className="badge badge-pending">At cap</span>
                    ) : (
                      <span className="badge badge-active">OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState icon={Gauge} message="No metered customers yet" compact />
        )}
      </div>

      {/* Billing Cycles */}
      <div className="glass-card overflow-hidden">
        <div className="px-5 py-4 border-b border-cv-border">
          <h3 className="text-sm font-semibold text-cv-text flex items-center gap-2">
            <FileText size={16} className="text-cv-accent" /> Billing Cycles
          </h3>
          <p className="text-xs text-cv-text-muted mt-1">
            Cycles close hourly after their period ends; usage facts are frozen and an invoice is finalized
          </p>
        </div>
        {cycles.length > 0 ? (
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Period</th>
                <th>Status</th>
                <th>Avg GB</th>
                <th>GB-Hours</th>
                <th>Snapshots</th>
                <th>Amount</th>
                <th>Invoice</th>
              </tr>
            </thead>
            <tbody>
              {cycles.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium">{c.customerName}</td>
                  <td className="text-cv-text-muted text-xs whitespace-nowrap">
                    {formatDate(c.periodStart)} — {formatDate(c.periodEnd)}
                  </td>
                  <td><span className={`badge ${CYCLE_BADGES[c.status] || 'badge-pending'}`}>{c.status}</span></td>
                  <td className="font-mono">{c.avgGB != null ? c.avgGB.toFixed(3) : '—'}</td>
                  <td className="font-mono text-cv-text-muted">{c.gbHours != null ? c.gbHours.toFixed(1) : '—'}</td>
                  <td className="font-mono text-cv-text-muted">{c.snapshotCount ?? '—'}</td>
                  <td className="font-mono">{c.amountCents != null ? formatCurrency(c.amountCents) : '—'}</td>
                  <td>
                    {c.invoice ? (
                      <Link to={`/invoices/${c.invoice.id}`} className="text-cv-primary hover:text-cv-primary-hover text-xs font-medium">
                        {c.invoice.invoiceNumber}
                        <span className={`badge badge-${c.invoice.status.toLowerCase()} ml-2`}>{c.invoice.status}</span>
                      </Link>
                    ) : (
                      <span className="text-xs text-cv-text-muted">Accruing…</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState icon={FileText} message="No billing cycles yet — cycles appear when a customer subscribes to the Usage-Metered plan" compact />
        )}
      </div>
    </div>
  );
}
