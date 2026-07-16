import { useEffect, useState } from 'react';
import { Plus, Package, BarChart3, FolderTree } from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';
import { formatDate } from '../../lib/format';
import Modal from '../../components/ui/Modal';
import TabPills from '../../components/ui/TabPills';

export default function ProductCatalog() {
  const [families, setFamilies] = useState([]);
  const [products, setProducts] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [tab, setTab] = useState('families');
  const [showModal, setShowModal] = useState(null);
  const [form, setForm] = useState({});
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    Promise.all([api.getProductFamilies(), api.getProducts(), api.getBillableMetrics()])
      .then(([f, p, m]) => { setFamilies(f.data); setProducts(p.data); setMetrics(m.data); })
      .catch((err) => toast.error(err.message || 'Failed to load catalog'));
  }, []);

  const handleCreate = async () => {
    setCreating(true);
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
    finally { setCreating(false); }
  };

  const tabs = [
    { key: 'families', label: `Product Families (${families.length})`, icon: FolderTree },
    { key: 'products', label: `Products (${products.length})`, icon: Package },
    { key: 'metrics', label: `Billable Metrics (${metrics.length})`, icon: BarChart3 },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-cv-text">Product Catalog</h1>
        <button onClick={() => { setShowModal(tab === 'families' ? 'family' : tab === 'products' ? 'product' : 'metric'); setForm({}); }} className="btn btn-primary"><Plus size={16} /> Add {tab === 'families' ? 'Family' : tab === 'products' ? 'Product' : 'Metric'}</button>
      </div>

      <div className="mb-4">
        <TabPills tabs={tabs} active={tab} onChange={setTab} />
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
                  <td className="text-cv-text-secondary">{formatDate(f.createdAt)}</td>
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
                  <td className="text-cv-text-secondary">{formatDate(p.createdAt)}</td>
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
      <Modal
        open={!!showModal}
        onClose={() => setShowModal(null)}
        title={`Create ${showModal === 'family' ? 'Product Family' : showModal === 'product' ? 'Product' : 'Billable Metric'}`}
        footer={
          <>
            <button className="btn btn-primary" onClick={handleCreate} disabled={creating}>
              {creating && <span className="btn-spinner" />}
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button className="btn btn-secondary" onClick={() => setShowModal(null)}>Cancel</button>
          </>
        }
      >
        <div className="space-y-3">
          <div><label className="form-label" htmlFor="catalog-name">Name</label><input id="catalog-name" className="form-input" value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          {showModal === 'product' && (
            <>
              <div><label className="form-label" htmlFor="catalog-family">Product Family</label>
                <select id="catalog-family" className="form-input" value={form.productFamilyId || ''} onChange={(e) => setForm({ ...form, productFamilyId: e.target.value })}>
                  <option value="">Select...</option>
                  {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </div>
              <div><label className="form-label" htmlFor="catalog-desc">Description</label><input id="catalog-desc" className="form-input" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            </>
          )}
          {showModal === 'metric' && (
            <>
              <div><label className="form-label" htmlFor="catalog-code">Code</label><input id="catalog-code" className="form-input font-mono" placeholder="api_calls" value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
              <div><label className="form-label" htmlFor="catalog-aggtype">Aggregation Type</label>
                <select id="catalog-aggtype" className="form-input" value={form.aggregationType || ''} onChange={(e) => setForm({ ...form, aggregationType: e.target.value })}>
                  <option value="">Select...</option>
                  {['COUNT', 'SUM', 'MAX', 'UNIQUE_COUNT', 'AVERAGE'].map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label className="form-label" htmlFor="catalog-aggkey">Aggregation Key</label><input id="catalog-aggkey" className="form-input font-mono" placeholder="property name (for SUM, MAX, etc.)" value={form.aggregationKey || ''} onChange={(e) => setForm({ ...form, aggregationKey: e.target.value })} /></div>
              <div><label className="form-label" htmlFor="catalog-mdesc">Description</label><input id="catalog-mdesc" className="form-input" value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
