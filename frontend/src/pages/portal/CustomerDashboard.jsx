import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { HardDrive, FolderOpen, Zap, IndianRupee, FileText, ArrowUpRight, Clock } from 'lucide-react';
import api from '../../api/client';
import ErrorBanner from '../../components/ui/ErrorBanner';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import StatCard from '../../components/ui/StatCard';
import { formatCurrency } from '../../lib/currency';
import { formatDate } from '../../lib/format';
import { EVENT_LABELS } from '../../lib/uiMaps';
import { PRIMARY, GRID_STROKE, AXIS_STROKE, TOOLTIP_STYLE } from '../../lib/chartTheme';

export default function CustomerDashboard() {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashboard, historyRes, activityRes] = await Promise.all([
        api.getPortalDashboard(),
        api.getStorageUsageHistory(`customerId=${localStorage.getItem('cv_customer_id')}&days=30`),
        api.getPortalActivity(),
      ]);
      setData(dashboard);
      setHistory(historyRes?.data || []);
      setActivity(activityRes?.data || []);
    } catch (err) {
      setError(err.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} onRetry={fetchData} />;

  const chartData = history.map(s => ({
    time: formatDate(s.snapshotTime, 'monthDay'),
    gb: s.usedGB,
  }));

  return (
    <div className="animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-cv-text">Dashboard</h1>
        <p className="text-cv-text-secondary text-sm mt-1">Your storage overview at a glance</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={HardDrive}
          label="Storage Used"
          value={`${data?.storage?.totalGB?.toFixed(2)} GB`}
          subValue={data?.storage?.quotaGB > 0 ? `${data.storage.usagePercent}% of ${data.storage.quotaGB} GB quota` : undefined}
          accent="primary"
          progress={data?.storage?.quotaGB > 0 ? { percent: data.storage.usagePercent, danger: data.storage.usagePercent > 90 } : undefined}
        />
        <StatCard
          icon={FolderOpen}
          label="Objects"
          value={(data?.storage?.totalObjects || 0).toLocaleString()}
          subValue={`${data?.storage?.totalBuckets || 0} buckets`}
          accent="neutral"
        />
        <StatCard
          icon={Zap}
          label="Requests (24h)"
          value={(data?.requests24h || 0).toLocaleString()}
          subValue="PUT + GET + DELETE"
          accent="neutral"
        />
        <StatCard
          icon={IndianRupee}
          label="Est. Monthly Cost"
          value={formatCurrency(data?.estimatedCostCents || 0)}
          subValue="Current billing period"
          accent="primary"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Storage Trend */}
        <div className="lg:col-span-2 glass-card p-5">
          <h3 className="text-sm font-semibold text-cv-text mb-4">Storage Over Time (30 days)</h3>
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="portalGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PRIMARY} stopOpacity={0.2} />
                    <stop offset="95%" stopColor={PRIMARY} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                <XAxis dataKey="time" stroke={AXIS_STROKE} fontSize={11} />
                <YAxis stroke={AXIS_STROKE} fontSize={11} tickFormatter={(v) => `${v} GB`} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => [`${v.toFixed(2)} GB`, 'Storage']} />
                <Area type="monotone" dataKey="gb" stroke={PRIMARY} strokeWidth={2} fill="url(#portalGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-60 text-cv-text-muted text-sm">No data available yet</div>
          )}
        </div>

        {/* Current Plan + Activity */}
        <div className="space-y-6">
          {/* Plan Card */}
          {data?.subscription && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-cv-text mb-3">Current Plan</h3>
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg font-bold text-cv-text">{data.subscription.planName}</span>
                <span className={`badge badge-${data.subscription.status.toLowerCase()}`}>{data.subscription.status}</span>
              </div>
              <p className="text-xs text-cv-text-muted mb-3">{data.subscription.billingPeriod} billing</p>
              <Link to="/portal/billing" className="text-xs text-cv-primary hover:text-cv-primary-hover font-medium flex items-center gap-1">
                View billing details <ArrowUpRight size={12} />
              </Link>
            </div>
          )}

          {/* Recent Activity */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-cv-text mb-3">Recent Activity</h3>
            {activity.length > 0 ? (
              <div className="space-y-2">
                {activity.slice(0, 8).map((evt) => (
                  <div key={evt.id} className="flex items-center gap-2 text-xs">
                    <Clock size={12} className="text-cv-text-muted flex-shrink-0" />
                    <span className="text-cv-text-secondary">{EVENT_LABELS[evt.eventCode] || evt.eventCode}</span>
                    <span className="text-cv-text-muted ml-auto">{formatDate(evt.timestamp, 'datetime')}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-cv-text-muted">No recent activity</p>
            )}
          </div>

          {/* Quick Links */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-cv-text mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <Link to="/portal/storage" className="flex items-center gap-2 text-sm text-cv-text-secondary hover:text-cv-primary transition-colors">
                <FolderOpen size={14} /> Browse my files
              </Link>
              <Link to="/portal/billing" className="flex items-center gap-2 text-sm text-cv-text-secondary hover:text-cv-primary transition-colors">
                <FileText size={14} /> View invoices
              </Link>
              <Link to="/portal/developer" className="flex items-center gap-2 text-sm text-cv-text-secondary hover:text-cv-primary transition-colors">
                <Zap size={14} /> Get API key
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
