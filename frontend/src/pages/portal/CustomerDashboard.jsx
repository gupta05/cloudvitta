import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { HardDrive, FolderOpen, Zap, IndianRupee, FileText, ArrowUpRight, Clock } from 'lucide-react';
import api from '../../api/client';
import ErrorBanner from '../../components/ui/ErrorBanner';
import { formatCurrency } from '../../lib/currency';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

const eventLabels = {
  storage_put_ops: 'Upload',
  storage_get_ops: 'Download',
  storage_delete_ops: 'Delete',
};

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

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-cv-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <ErrorBanner message={error} onRetry={fetchData} />;

  const chartData = history.map(s => ({
    time: new Date(s.snapshotTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
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
        <div className="glass-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-cv-text-muted uppercase tracking-wide">Storage Used</p>
              <p className="text-2xl font-bold text-cv-text mt-1">{data?.storage?.totalGB?.toFixed(2)} GB</p>
              {data?.storage?.quotaGB > 0 && (
                <p className="text-xs text-cv-text-secondary mt-1">{data.storage.usagePercent}% of {data.storage.quotaGB} GB quota</p>
              )}
            </div>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-zinc-800 border border-zinc-700">
              <HardDrive size={20} className="text-cv-accent" />
            </div>
          </div>
          {data?.storage?.quotaGB > 0 && (
            <div className="mt-3 progress-bar">
              <div className="progress-bar-fill" style={{ width: `${Math.min(100, data.storage.usagePercent)}%`, background: data.storage.usagePercent > 90 ? '#ef4444' : undefined }} />
            </div>
          )}
        </div>

        <div className="glass-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-cv-text-muted uppercase tracking-wide">Objects</p>
              <p className="text-2xl font-bold text-cv-text mt-1">{(data?.storage?.totalObjects || 0).toLocaleString()}</p>
              <p className="text-xs text-cv-text-secondary mt-1">{data?.storage?.totalBuckets || 0} buckets</p>
            </div>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-zinc-800 border border-zinc-700">
              <FolderOpen size={20} className="text-cv-accent" />
            </div>
          </div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-cv-text-muted uppercase tracking-wide">Requests (24h)</p>
              <p className="text-2xl font-bold text-cv-text mt-1">{(data?.requests24h || 0).toLocaleString()}</p>
              <p className="text-xs text-cv-text-secondary mt-1">PUT + GET + DELETE</p>
            </div>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-zinc-800 border border-zinc-700">
              <Zap size={20} className="text-cv-accent" />
            </div>
          </div>
        </div>

        <div className="glass-card p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold text-cv-text-muted uppercase tracking-wide">Est. Monthly Cost</p>
              <p className="text-2xl font-bold text-cv-accent mt-1">{formatCurrency(data?.estimatedCostCents || 0)}</p>
              <p className="text-xs text-cv-text-secondary mt-1">Current billing period</p>
            </div>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-zinc-800 border border-zinc-700">
              <IndianRupee size={20} className="text-cv-accent" />
            </div>
          </div>
        </div>
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
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="time" stroke="#52525b" fontSize={11} />
                <YAxis stroke="#52525b" fontSize={11} tickFormatter={(v) => `${v} GB`} />
                <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '6px', color: '#fafafa', fontSize: '0.8rem' }} formatter={(v) => [`${v.toFixed(2)} GB`, 'Storage']} />
                <Area type="monotone" dataKey="gb" stroke="#3b82f6" strokeWidth={2} fill="url(#portalGrad)" />
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
                    <span className="text-cv-text-secondary">{eventLabels[evt.eventCode] || evt.eventCode}</span>
                    <span className="text-cv-text-muted ml-auto">{new Date(evt.timestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
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
