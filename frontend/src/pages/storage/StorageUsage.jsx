import { useEffect, useState } from 'react';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, HardDrive, Upload, Download, Zap, IndianRupee } from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export default function StorageUsage() {
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [usage, setUsage] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingUsage, setLoadingUsage] = useState(false);

  const isAdmin = api.isAdmin();

  useEffect(() => {
    if (isAdmin) {
      // Admins need to pick a customer from a dropdown
      api.getCustomers()
        .then(res => {
          setCustomers(res.data || []);
          if (res.data?.length > 0) setSelectedCustomer(res.data[0].id);
        })
        .catch(() => toast.error('Failed to load customers'))
        .finally(() => setLoading(false));
    } else {
      // End-users: load their own usage immediately (no customerId needed — API auto-scopes)
      setLoading(false);
      loadUsage('');
    }
  }, []);

  async function loadUsage(customerId) {
    setLoadingUsage(true);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
    const customerParam = customerId ? `customerId=${customerId}&` : '';
    try {
      const [usageData, historyData] = await Promise.all([
        api.getStorageUsage(`${customerParam}periodStart=${thirtyDaysAgo}`),
        api.getStorageUsageHistory(`${customerParam}days=30`),
      ]);
      setUsage(usageData);
      setHistory(historyData.data || []);
    } catch {
      toast.error('Failed to load usage data');
    } finally {
      setLoadingUsage(false);
    }
  }

  useEffect(() => {
    if (!isAdmin) return; // end-users load via initial useEffect
    if (!selectedCustomer) return;
    loadUsage(selectedCustomer);
  }, [selectedCustomer]);

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-cv-primary border-t-transparent rounded-full animate-spin" /></div>;

  // Process history for charts
  const storageChartData = history.map(s => ({
    time: new Date(s.snapshotTime).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    gb: s.usedGB,
    objects: s.objectCount,
  }));

  // Deduplicate by date (take last snapshot per day)
  const dailyData = {};
  storageChartData.forEach(d => {
    dailyData[d.time] = d;
  });
  const chartData = Object.values(dailyData);

  // Real per-unit rates sourced from the active plan's pricing model (via the backend),
  // NOT hardcoded. On the current plans (Free 500 MB / Pro 1 GB) these are all ₹0 because
  // storage is hard-capped and operations are included — so the estimate is ₹0 unless the
  // plan itself defines real overage pricing.
  const storageRate = usage?.plan?.storageUnitPrice ?? 0;        // ₹/GB/mo over the included quota
  const putRate = usage?.plan?.putPricePerThousand ?? 0;         // ₹/1K PUT ops over included
  const getRate = usage?.plan?.getPricePerThousand ?? 0;         // ₹/1K GET ops

  // Estimate the customer's usage-based cost. Egress/bandwidth is an internal infra metric
  // and is intentionally excluded here — customers are billed for storage (+ ops), not egress.
  const estimatedCost = usage ? (() => {
    let cost = 0;
    const storageGB = usage.storage?.avgGB || 0;
    const planIncludedGB = usage.plan?.quotaGB || 0;
    cost += Math.max(0, storageGB - planIncludedGB) * storageRate;
    const putOps = usage.operations?.storage_put_ops || 0;
    const includedOps = usage.plan?.includedOps || 0;
    cost += (Math.max(0, putOps - includedOps) / 1000) * putRate;
    const getOps = usage.operations?.storage_get_ops || 0;
    cost += (getOps / 1000) * getRate;
    return cost;
  })() : 0;

  // Internal infrastructure cost awareness for egress (NOT charged to the customer).
  const egressInfraGB = usage?.bandwidth?.storage_egress_bytes?.totalGB || 0;
  const ingressInfraGB = usage?.bandwidth?.storage_ingress_bytes?.totalGB || 0;
  const egressInfraCost = egressInfraGB * 7.5;

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-cv-text">{isAdmin ? 'Storage Usage & Billing' : 'My Usage & Billing'}</h1>
          <p className="text-cv-text-secondary text-sm mt-1">Real-time metered usage from actual storage consumption</p>
        </div>
        {/* Customer dropdown — only for admins */}
        {isAdmin && (
          <select
            className="form-input w-auto"
            value={selectedCustomer}
            onChange={(e) => setSelectedCustomer(e.target.value)}
          >
            {customers.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {loadingUsage ? (
        <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-cv-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : usage ? (
        <>
          {/* Usage KPIs */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="glass-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-cv-text-muted uppercase tracking-wide">Current Storage</p>
                  <p className="text-2xl font-bold text-cv-text mt-1">{usage.storage?.currentGB?.toFixed(2)} GB</p>
                  <p className="text-xs text-cv-text-secondary mt-1">{usage.storage?.currentObjects?.toLocaleString()} objects</p>
                </div>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-zinc-800 border border-zinc-700">
                  <HardDrive size={20} className="text-cv-accent" />
                </div>
              </div>
            </div>

            <div className="glass-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-cv-text-muted uppercase tracking-wide">Operations (30d)</p>
                  <p className="text-2xl font-bold text-cv-text mt-1">{((usage.operations?.storage_put_ops || 0) + (usage.operations?.storage_get_ops || 0)).toLocaleString()}</p>
                  <p className="text-xs text-cv-text-secondary mt-1">{usage.operations?.storage_put_ops || 0} PUT, {usage.operations?.storage_get_ops || 0} GET</p>
                </div>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-zinc-800 border border-zinc-700">
                  <Zap size={20} className="text-cv-accent" />
                </div>
              </div>
            </div>

            <div className="glass-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-cv-text-muted uppercase tracking-wide">Egress (30d) · internal</p>
                  <p className="text-2xl font-bold text-cv-text mt-1">{egressInfraGB.toFixed(2)} GB</p>
                  <p className="text-xs text-cv-text-secondary mt-1">↑ {ingressInfraGB.toFixed(2)} GB ingress · not billed</p>
                </div>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-500/10 border border-purple-500/30">
                  <Download size={20} className="text-purple-400" />
                </div>
              </div>
            </div>

            <div className="glass-card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-cv-text-muted uppercase tracking-wide">Est. Cost (30d)</p>
                  <p className="text-2xl font-bold text-cv-accent mt-1">₹{estimatedCost.toFixed(2)}</p>
                  <p className="text-xs text-cv-text-secondary mt-1">Based on metered usage</p>
                </div>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-zinc-800 border border-zinc-700">
                  <IndianRupee size={20} className="text-cv-accent" />
                </div>
              </div>
            </div>
          </div>

          {/* Plan Quota (if applicable) */}
          {usage.plan && (
            <div className="glass-card p-5 mb-6">
              <h3 className="text-sm font-semibold text-cv-text mb-3">Plan Quota</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-cv-text-secondary">Storage</span>
                    <span className="font-mono text-cv-text">{usage.plan.usedGB.toFixed(1)} / {usage.plan.quotaGB} GB</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-bar-fill"
                      style={{
                        width: `${Math.min(100, (usage.plan.usedGB / usage.plan.quotaGB) * 100)}%`,
                        background: usage.plan.usedGB > usage.plan.quotaGB ? '#ef4444' : undefined
                      }}
                    />
                  </div>
                  {usage.plan.overageGB > 0 && (
                    <p className="text-[10px] text-cv-warning mt-1">
                      ⚠ {usage.plan.overageGB.toFixed(1)} GB over your {usage.plan.quotaGB} GB quota
                      {storageRate > 0 ? ` (billed at ₹${storageRate}/GB)` : ' (hard cap — uploads blocked until you free space or upgrade)'}
                    </p>
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-cv-text-secondary">PUT Operations</span>
                    <span className="font-mono text-cv-text">{(usage.operations?.storage_put_ops || 0).toLocaleString()} / {(usage.plan.includedOps || 0).toLocaleString()}</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-bar-fill" style={{ width: `${Math.min(100, ((usage.operations?.storage_put_ops || 0) / (usage.plan.includedOps || 1)) * 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Storage Trend Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-cv-text mb-4">Storage Over Time (30 days)</h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="storageGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="time" stroke="#52525b" fontSize={11} />
                    <YAxis stroke="#52525b" fontSize={11} tickFormatter={(v) => `${v} GB`} />
                    <Tooltip contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: '6px', color: '#fafafa', fontSize: '0.8rem' }} formatter={(v) => [`${v.toFixed(2)} GB`, 'Storage']} />
                    <Area type="monotone" dataKey="gb" stroke="#3b82f6" strokeWidth={2} fill="url(#storageGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex items-center justify-center h-60 text-cv-text-muted text-sm">No snapshot data available</div>
              )}
            </div>

            {/* Bucket Breakdown */}
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-cv-text mb-4">Bucket Breakdown</h3>
              <div className="space-y-3">
                {(usage.buckets || []).map((bucket, i) => {
                  const maxBytes = usage.buckets?.[0]?.usedBytes || 1;
                  const pct = (bucket.usedBytes / Math.max(maxBytes, 1)) * 100;
                  const colors = ['#6366f1', '#22d3ee', '#34d399', '#fbbf24', '#f87171'];
                  return (
                    <div key={bucket.id}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-cv-text font-medium">{bucket.name}</span>
                        <span className="text-xs text-cv-text-secondary font-mono">{formatBytes(bucket.usedBytes)}</span>
                      </div>
                      <div className="storage-meter">
                        <div className="storage-meter-fill" style={{ width: `${pct}%`, background: colors[i % colors.length] }} />
                      </div>
                      <p className="text-[10px] text-cv-text-muted mt-0.5">{bucket.objectCount.toLocaleString()} objects</p>
                    </div>
                  );
                })}
                {(!usage.buckets || usage.buckets.length === 0) && (
                  <div className="text-center py-8 text-cv-text-muted text-sm">No buckets found</div>
                )}
              </div>
            </div>
          </div>

          {/* Billing Detail */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-cv-text mb-4">Billing Breakdown (Current Period)</h3>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Usage</th>
                  <th>Rate</th>
                  <th className="text-right">Estimated Cost</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="font-medium">Storage (GB-month avg)</td>
                  <td className="font-mono text-xs">{usage.storage?.avgGB?.toFixed(2)} GB</td>
                  <td className="text-xs text-cv-text-secondary">{storageRate > 0 ? `₹${storageRate}/GB/mo` : 'Included (hard cap)'}</td>
                  <td className="text-right font-mono">₹{(Math.max(0, (usage.storage?.avgGB || 0) - (usage.plan?.quotaGB || 0)) * storageRate).toFixed(4)}</td>
                </tr>
                <tr>
                  <td className="font-medium">PUT/POST Operations</td>
                  <td className="font-mono text-xs">{(usage.operations?.storage_put_ops || 0).toLocaleString()}</td>
                  <td className="text-xs text-cv-text-secondary">{putRate > 0 ? `₹${putRate}/1K requests` : 'Included'}</td>
                  <td className="text-right font-mono">₹{(Math.max(0, (usage.operations?.storage_put_ops || 0) - (usage.plan?.includedOps || 0)) / 1000 * putRate).toFixed(4)}</td>
                </tr>
                <tr>
                  <td className="font-medium">GET/HEAD Operations</td>
                  <td className="font-mono text-xs">{(usage.operations?.storage_get_ops || 0).toLocaleString()}</td>
                  <td className="text-xs text-cv-text-secondary">{getRate > 0 ? `₹${getRate}/1K requests` : 'Included'}</td>
                  <td className="text-right font-mono">₹{((usage.operations?.storage_get_ops || 0) / 1000 * getRate).toFixed(4)}</td>
                </tr>
                <tr className="border-t-2 border-cv-border">
                  <td className="font-bold text-cv-text" colSpan={3}>Estimated Total (overage only)</td>
                  <td className="text-right font-mono font-bold text-cv-primary">₹{estimatedCost.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
            <p className="text-[10px] text-cv-text-muted mt-3">* Costs reflect customer usage-based charges only (storage + operations). Plan base fees are applied separately on the invoice. Egress bandwidth is an internal infrastructure metric and is not billed to the customer.</p>
          </div>

          {/* Internal infrastructure metric — egress/bandwidth (admin-only, not billed) */}
          <div className="glass-card p-5 mt-6 border border-purple-500/20">
            <div className="flex items-center gap-2 mb-4">
              <Download size={16} className="text-purple-400" />
              <h3 className="text-sm font-semibold text-cv-text">Bandwidth — Internal Infrastructure</h3>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/30">Not billed to customer</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <p className="text-xs text-cv-text-secondary">Egress (30d)</p>
                <p className="text-xl font-bold text-cv-text mt-1">{egressInfraGB.toFixed(2)} GB</p>
              </div>
              <div>
                <p className="text-xs text-cv-text-secondary">Ingress (30d)</p>
                <p className="text-xl font-bold text-cv-text mt-1">{ingressInfraGB.toFixed(2)} GB</p>
              </div>
              <div>
                <p className="text-xs text-cv-text-secondary">Est. Infra Egress Cost <span className="text-cv-text-muted">(@ ₹7.5/GB)</span></p>
                <p className="text-xl font-bold text-purple-300 mt-1">₹{egressInfraCost.toFixed(2)}</p>
              </div>
            </div>
            <p className="text-[10px] text-cv-text-muted mt-3">For infrastructure cost awareness only. Egress is tracked internally and excluded from customer billing and quotas.</p>
          </div>
        </>
      ) : (
        <div className="glass-card p-12 text-center">
          <TrendingUp size={48} className="mx-auto mb-3 text-cv-text-muted opacity-30" />
          <p className="text-cv-text-secondary">Select a customer to view usage data</p>
        </div>
      )}
    </div>
  );
}
