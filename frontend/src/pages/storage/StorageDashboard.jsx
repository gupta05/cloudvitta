import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { HardDrive, FolderOpen, ArrowUpDown, TrendingUp, Upload, Download, Zap, ChevronRight } from 'lucide-react';
import api from '../../api/client';
import ErrorBanner from '../../components/ui/ErrorBanner';
import LoadingSpinner from '../../components/ui/LoadingSpinner';
import StatCard from '../../components/ui/StatCard';
import { formatBytes } from '../../lib/format';
import { CHART_COLORS, TOOLTIP_STYLE } from '../../lib/chartTheme';

export default function StorageDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = () => {
    setLoading(true);
    setError(null);
    api.getStorageStats()
      .then(setStats)
      .catch((err) => setError(err.message || 'Failed to load storage stats'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchStats(); }, []);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorBanner message={error} onRetry={fetchStats} />;

  const pieData = stats?.topBuckets?.map((b) => ({
    name: b.name,
    value: b.usedGB,
    customer: b.customerName,
  })) || [];

  return (
    <div className="animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-cv-text">Object Storage</h1>
          <p className="text-cv-text-secondary text-sm mt-1">Real-time storage overview across all customers</p>
        </div>
        <Link to="/storage/buckets" className="btn btn-primary">
          <FolderOpen size={16} /> Manage Buckets
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 mb-8">
        <StatCard icon={HardDrive} label="Total Storage" value={formatBytes(stats?.totalBytes || 0)} subValue={`${stats?.totalGB?.toFixed(2) || 0} GB used`} accent="primary" />
        <StatCard icon={FolderOpen} label="Buckets" value={stats?.totalBuckets || 0} subValue="Across all customers" accent="neutral" />
        <StatCard icon={Zap} label="Total Objects" value={(stats?.totalObjects || 0).toLocaleString()} subValue="Files stored" accent="success" />
        <StatCard icon={ArrowUpDown} label="Operations (24h)" value={(stats?.operationsLast24h || 0).toLocaleString()} subValue="PUT + GET + DELETE" accent="warning" />
        <StatCard icon={Download} label="Egress (30d)" value={`${(stats?.totalEgressGB || 0).toFixed(2)} GB`} subValue="Internal infra · not billed" accent="purple" />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Storage Distribution */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-cv-text mb-4">Storage by Bucket</h3>
          {pieData.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={220}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={85} paddingAngle={3} dataKey="value">
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    formatter={(v) => [`${v.toFixed(2)} GB`, 'Storage']}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-2">
                {pieData.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} aria-hidden="true" />
                    <span className="text-cv-text-secondary truncate flex-1">{entry.name}</span>
                    <span className="text-cv-text font-mono">{entry.value.toFixed(1)} GB</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-52 text-cv-text-muted">
              <HardDrive size={32} className="mb-2 opacity-30" />
              <p className="text-sm">No storage data yet</p>
            </div>
          )}
        </div>

        {/* Top Buckets Table */}
        <div className="glass-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-cv-text">Top Buckets by Size</h3>
            <Link to="/storage/buckets" className="text-xs text-cv-primary hover:text-cv-primary-hover font-medium flex items-center gap-1">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          <div className="space-y-3">
            {(stats?.topBuckets || []).map((bucket, i) => {
              const maxBytes = stats?.topBuckets?.[0]?.usedBytes || 1;
              const pct = (bucket.usedBytes / maxBytes) * 100;
              return (
                <div key={i}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <FolderOpen size={14} className="text-cv-text-muted" />
                      <span className="text-sm text-cv-text font-medium">{bucket.name}</span>
                    </div>
                    <span className="text-xs text-cv-text-secondary font-mono">{bucket.usedGB.toFixed(2)} GB</span>
                  </div>
                  <div className="storage-meter">
                    <div className="storage-meter-fill" style={{ width: `${pct}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  </div>
                  <p className="text-[10px] text-cv-text-muted mt-0.5">{bucket.customerName}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link to="/storage/buckets" className="glass-card p-5 hover:border-cv-primary transition-colors group cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="icon-chip">
              <FolderOpen size={20} className="text-cv-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-cv-text group-hover:text-cv-primary transition-colors">Browse Buckets</p>
              <p className="text-xs text-cv-text-muted">Manage buckets and objects</p>
            </div>
          </div>
        </Link>
        <Link to="/storage/usage" className="glass-card p-5 hover:border-cv-accent-muted transition-colors group cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="icon-chip">
              <TrendingUp size={20} className="text-cv-accent" />
            </div>
            <div>
              <p className="text-sm font-semibold text-cv-text group-hover:text-cv-accent transition-colors">Usage & Billing</p>
              <p className="text-xs text-cv-text-muted">View metered usage and costs</p>
            </div>
          </div>
        </Link>
        <Link to="/plans" className="glass-card p-5 hover:border-cv-success/50 transition-colors group cursor-pointer">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-cv-success/10 border border-cv-success/30">
              <Upload size={20} className="text-cv-success" />
            </div>
            <div>
              <p className="text-sm font-semibold text-cv-text group-hover:text-cv-success transition-colors">Storage Plans</p>
              <p className="text-xs text-cv-text-muted">Free (500 MB) & Pro (1 GB)</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
