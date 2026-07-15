import { useEffect, useState } from 'react';
import { Plus, Package, BarChart3, FolderTree } from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';

export default function ProductCatalog() {
  const [families, setFamilies] = useState([]);
  const [products, setProducts] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [tab, setTab] = useState('families');
  const [showModal, setShowModal] = useState(null);
  const [form, setForm] = useState({});

  useEffect(() => {
    Promise.all([api.getProductFamilies(), api.getProducts(), api.getBillableMetrics()])
      .then(([f, p, m]) => { setFamilies(f.data); setProducts(p.data); setMetrics(m.data); });
  }, []);

  const handleCreate = async () => {
    try {
      if (showModal === 'family') {
        await api.createProductFamily({ name: form.name });
        toast.success('Product family created');
      } else if (showModal === 'product') {
        await api.createProduct({ name: form.name, description: form.description, productFamilyId: form.productFamilyId });
        toast.success('Product created');
      } else if (showModal === 'metric') {
        await api.createBillableMetric({ name: form.name, code: form.code, aggregationType: form.aggregationType, aggregationKey: form.aggregationKey, description: form.description });
        toast.success('Billable metric created');
      }
      setShowModal(null); setForm({});
      const [f, p, m] = await Promise.all([api.getProductFamilies(), api.getProducts(), api.getBillableMetrics()]);
      setFamilies(f.data); setProducts(p.data); setMetrics(m.data);
    } catch (err) { toast.error(err.message); }
  };

  const tabs = [
    { key: 'families', label: 'Product Families', icon: FolderTree, count: families.length },
    { key: 'products', label: 'Products', icon: Package, count: products.length },
    { key: 'metrics', label: 'Billable Metrics', icon: BarChart3, count: metrics.length },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-cv-text">Product Catalog</h1>
        <button onClick={() => { setShowModal(tab === 'families' ? 'family' : tab === 'products' ? 'product' : 'metric'); setForm({}); }} className="btn btn-primary"><Plus size={16} /> Add {tab === 'families' ? 'Family' : tab === 'products' ? 'Product' : 'Metric'}</button>
      </div>

      <div className="flex gap-1 mb-4 p-1 rounded-lg bg-cv-surface-2 inline-flex">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t.key ? 'bg-cv-primary text-white' : 'text-cv-text-secondary hover:text-cv-text'}`}>
            <t.icon size={16} /> {t.label} <span className="text-xs opacity-70">({t.count})</span>
          </button>
        ))}
      </div>

      <div className="glass-card overflow-hidden">
        {tab === 'families' && (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Products</th><th>Plans</th><th>Created</th></tr></thead>
            <tbody>
              {families.map((f) => (
                <tr key={f.id}>
                  <td className="font-medium">{f.name}</td>
                  <td>{f._count?.products || 0}</td>
                  <td>{f._count?.plans || 0}</td>
                  <td className="text-cv-text-secondary">{new Date(f.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {families.length === 0 && <tr><td colSpan="4" className="text-center py-8 text-cv-text-muted">No product families yet</td></tr>}
            </tbody>
          </table>
        )}
        {tab === 'products' && (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Family</th><th>Description</th><th>Created</th></tr></thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="font-medium">{p.name}</td>
                  <td><span className="badge badge-active">{p.productFamily?.name}</span></td>
                  <td className="text-cv-text-secondary text-sm max-w-xs truncate">{p.description || '—'}</td>
                  <td className="text-cv-text-secondary">{new Date(p.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
              {products.length === 0 && <tr><td colSpan="4" className="text-center py-8 text-cv-text-muted">No products yet</td></tr>}
            </tbody>
          </table>
        )}
        {tab === 'metrics' && (
          <table className="data-table">
            <thead><tr><th>Name</th><th>Code</th><th>Aggregation</th><th>Key</th><th>Description</th></tr></thead>
            <tbody>
              {metrics.map((m) => (
                <tr key={m.id}>
                  <td className="font-medium">{m.name}</td>
                  <td><span className="font-mono text-xs bg-cv-surface-2 px-2 py-0.5 rounded">{m.code}</span></td>
                  <td><span className="badge badge-finalized">{m.aggregationType}</span></td>
                  <td className="text-cv-text-secondary font-mono text-xs">{m.aggregationKey || '—'}</td>
                  <td className="text-cv-text-secondary text-sm">{m.description || '—'}</td>
                </tr>
              ))}
              {metrics.length === 0 && <tr><td colSpan="5" className="text-center py-8 text-cv-text-muted">No metrics yet</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in" onClick={() => setShowModal(null)}>
          <div className="glass-card p-6 w-full max-w-md glow-primary" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-cv-text mb-4">Create {showModal === 'family' ? 'Product Family' : showModal === 'product' ? 'Product' : 'Billable Metric'}</h3>
            <div className="space-y-3">
              <div><label className="form-label">Name</label><input className="form-input" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              {showModal === 'product' && (
                <>
                  <div><label className="form-label">Product Family</label>
                    <select className="form-input" value={form.productFamilyId || ''} onChange={(e) => setForm({ ...form, productFamilyId: e.target.value })}>
                      <option value="">Select...</option>
                      {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                  <div><label className="form-label">Description</label><input className="form-input" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                </>
              )}
              {showModal === 'metric' && (
                <>
                  <div><label className="form-label">Code</label><input className="form-input font-mono" placeholder="api_calls" value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
                  <div><label className="form-label">Aggregation Type</label>
                    <select className="form-input" value={form.aggregationType || ''} onChange={(e) => setForm({ ...form, aggregationType: e.target.value })}>
                      <option value="">Select...</option>
                      {['COUNT', 'SUM', 'MAX', 'UNIQUE_COUNT', 'AVERAGE'].map((t) => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                  <div><label className="form-label">Aggregation Key</label><input className="form-input font-mono" placeholder="property name (for SUM, MAX, etc.)" value={form.aggregationKey || ''} onChange={(e) => setForm({ ...form, aggregationKey: e.target.value })} /></div>
                  <div><label className="form-label">Description</label><input className="form-input" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
                </>
              )}
            </div>
            <div className="flex gap-3 mt-5">
              <button className="btn btn-primary" onClick={handleCreate}>Create</button>
              <button className="btn btn-secondary" onClick={() => setShowModal(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
