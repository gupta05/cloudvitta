import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Users, CreditCard, FileText, TrendingUp, AlertCircle, Zap, HardDrive, FolderOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '../../api/client';
import ErrorBanner from '../../components/ui/ErrorBanner';
import { formatCurrency } from '../../lib/currency';

function StatCard({ icon: Icon, label, value, subValue, color }) {
  return (
    <div className="glass-card p-5 hover:scale-[1.02] transition-transform duration-200">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-cv-text-muted uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-cv-text mt-1">{value}</p>
          {subValue && <p className="text-xs text-cv-text-secondary mt-1">{subValue}</p>}
        </div>
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${color}20`, border: `1px solid ${color}40` }}>
          <Icon size={20} style={{ color }} />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = () => {
    setLoading(true);
    setError(null);
    api.getStats()
      .then(setStats)
      .catch((err) => setError(err.message || 'Failed to load dashboard stats'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchStats(); }, []);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-cv-primary border-t-transparent rounded-full animate-spin" /></div>;
  if (error) return <ErrorBanner message={error} onRetry={fetchStats} />;

  const revenueData = stats?.monthlyRevenue?.map((m) => ({
    month: new Date(m.month + '-01').toLocaleDateString('en-IN', { month: 'short' }),
    revenue: m.revenueCents / 100,
  })) || [];

  const subStatusData = stats?.subscriptionsByStatus?.map((s) => ({
    status: s.status,
    count: s.count,
  })) || [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-cv-text">Dashboard</h1>
        <p className="text-cv-text-secondary text-sm mt-1">Overview of your billing metrics</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard icon={TrendingUp} label="Monthly Recurring Revenue" value={formatCurrency(stats?.mrrCents || 0)} color="#3b82f6" />
        <StatCard icon={Users} label="Total Customers" value={stats?.totalCustomers || 0} subValue={`${stats?.activeSubscriptions || 0} active subscriptions`} color="#64748b" />
        <StatCard icon={CreditCard} label="Active Subscriptions" value={stats?.activeSubscriptions || 0} subValue={`${stats?.trialSubscriptions || 0} in trial`} color="#22c55e" />
        <StatCard icon={FileText} label="Invoices" value={stats?.totalInvoices || 0} subValue={stats?.overdueInvoices > 0 ? `${stats.overdueInvoices} overdue` : `${stats?.paidInvoices || 0} paid`} color={stats?.overdueInvoices > 0 ? '#ef4444' : '#f59e0b'} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Revenue Chart */}
        <div className="lg:col-span-2 glass-card p-5">
          <h3 className="text-sm font-semibold text-cv-text mb-4">Revenue (Last 12 Months)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
              <XAxis dataKey="month" stroke="#52525b" fontSize={12} />
              <YAxis stroke="#52525b" fontSize={12} tickFormatter={(v) => `₹${v}`} />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '6px', color: '#fafafa' }}
                formatter={(v) => [`₹${v.toFixed(2)}`, 'Revenue']}
              />
              <Line type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} activeDot={{ r: 5, fill: '#60a5fa' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Subscription Status */}
        <div className="glass-card p-5">
          <h3 className="text-sm font-semibold text-cv-text mb-4">Subscriptions by Status</h3>
          {subStatusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={subStatusData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis type="number" stroke="#52525b" fontSize={12} />
                <YAxis dataKey="status" type="category" stroke="#52525b" fontSize={11} width={80} />
                <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '6px', color: '#fafafa' }} />
                <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-cv-text-muted">
              <Zap size={32} className="mb-2 opacity-30" />
              <p className="text-sm">No subscription data yet</p>
            </div>
          )}
        </div>
      </div>

      {/* Storage Overview Card */}
      {stats?.storage && (
        <div className="mt-6">
          <Link to="/storage" className="glass-card p-5 block hover:border-cv-primary/50 transition-all duration-200 group">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-zinc-800 border border-zinc-700">
                  <HardDrive size={20} className="text-cv-accent" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-cv-text group-hover:text-cv-primary transition-colors">Object Storage</h3>
                  <p className="text-xs text-cv-text-muted">Real-time storage metering</p>
                </div>
              </div>
              <span className="text-xs text-cv-primary font-medium">View details →</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-xl font-bold text-cv-text">{stats.storage.totalGB.toFixed(1)} <span className="text-sm font-normal text-cv-text-muted">GB</span></p>
                <p className="text-[10px] text-cv-text-muted uppercase tracking-wide">Total Storage</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-cv-text">{stats.storage.totalBuckets}</p>
                <p className="text-[10px] text-cv-text-muted uppercase tracking-wide">Buckets</p>
              </div>
              <div className="text-center">
                <p className="text-xl font-bold text-cv-text">{stats.storage.totalObjects.toLocaleString()}</p>
                <p className="text-[10px] text-cv-text-muted uppercase tracking-wide">Objects</p>
              </div>
            </div>
          </Link>
        </div>
      )}
    </div>
  );
}
