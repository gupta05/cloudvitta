import { useEffect, useState } from 'react';
import { Key, Globe, Building, Plus, Copy, Eye, EyeOff } from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';
import ErrorBanner from '../../components/ui/ErrorBanner';

export default function Settings() {
  const [tab, setTab] = useState('entity');
  const [entity, setEntity] = useState({});
  const [tokens, setTokens] = useState([]);
  const [webhooks, setWebhooks] = useState([]);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [showWebhookModal, setShowWebhookModal] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [newRawToken, setNewRawToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [webhookForm, setWebhookForm] = useState({ url: '', events: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchAll = () => {
    setLoading(true);
    setError(null);
    Promise.all([
      api.getInvoicingEntity(),
      api.getApiTokens(),
      api.getWebhooks(),
    ]).then(([e, t, w]) => {
      setEntity(e);
      setTokens(t.data);
      setWebhooks(w.data);
    }).catch((err) => setError(err.message || 'Failed to load settings'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const saveEntity = async () => {
    try { await api.updateInvoicingEntity(entity); toast.success('Saved!'); } catch (e) { toast.error(e.message); }
  };

  const createToken = async () => {
    try {
      const t = await api.createApiToken({ name: newTokenName });
      setNewRawToken(t.rawToken);
      api.getApiTokens().then((d) => setTokens(d.data));
      toast.success('Token created — copy it now, it won\'t be shown again!');
    } catch (e) { toast.error(e.message); }
  };

  const revokeToken = async (id) => {
    await api.revokeApiToken(id);
    api.getApiTokens().then((d) => setTokens(d.data));
    toast.success('Token revoked');
  };

  const createWebhook = async () => {
    try {
      const events = webhookForm.events ? webhookForm.events.split(',').map((e) => e.trim()) : ['*'];
      await api.createWebhook({ url: webhookForm.url, events });
      toast.success('Webhook created');
      setShowWebhookModal(false); setWebhookForm({ url: '', events: '' });
      api.getWebhooks().then((d) => setWebhooks(d.data));
    } catch (e) { toast.error(e.message); }
  };

  const tabs = [
    { key: 'entity', label: 'Invoicing Entity', icon: Building },
    { key: 'tokens', label: 'API Tokens', icon: Key },
    { key: 'webhooks', label: 'Webhooks', icon: Globe },
  ];

  const updateEntity = (f) => (e) => setEntity({ ...entity, [f]: e.target.value });

  return (
    <div>
      <h1 className="text-2xl font-bold text-cv-text mb-6">Settings</h1>

      {loading ? (
        <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-2 border-cv-primary border-t-transparent rounded-full animate-spin" /></div>
      ) : error ? (
        <ErrorBanner message={error} onRetry={fetchAll} />
      ) : (
      <>

      <div className="flex gap-1 mb-6 p-1 rounded-lg bg-cv-surface-2 inline-flex">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${tab === t.key ? 'bg-cv-primary text-white' : 'text-cv-text-secondary hover:text-cv-text'}`}>
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* Invoicing Entity */}
      {tab === 'entity' && (
        <div className="glass-card p-6 max-w-2xl">
          <h3 className="text-sm font-semibold text-cv-text mb-4">Company Information (for invoices)</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="form-label">Legal Name</label><input className="form-input" value={entity.legalName || ''} onChange={updateEntity('legalName')} /></div>
            <div><label className="form-label">Tax ID</label><input className="form-input" value={entity.taxId || ''} onChange={updateEntity('taxId')} /></div>
            <div><label className="form-label">Country</label><input className="form-input" value={entity.country || ''} onChange={updateEntity('country')} /></div>
            <div className="col-span-2"><label className="form-label">Address Line 1</label><input className="form-input" value={entity.addressLine1 || ''} onChange={updateEntity('addressLine1')} /></div>
            <div><label className="form-label">City</label><input className="form-input" value={entity.city || ''} onChange={updateEntity('city')} /></div>
            <div><label className="form-label">State</label><input className="form-input" value={entity.state || ''} onChange={updateEntity('state')} /></div>
            <div><label className="form-label">Zip Code</label><input className="form-input" value={entity.zipCode || ''} onChange={updateEntity('zipCode')} /></div>
            <div className="col-span-2"><label className="form-label">Invoice Footer Note</label><input className="form-input" value={entity.footerNote || ''} onChange={updateEntity('footerNote')} /></div>
          </div>
          <button className="btn btn-primary mt-5" onClick={saveEntity}>Save Changes</button>
        </div>
      )}

      {/* API Tokens */}
      {tab === 'tokens' && (
        <div>
          <div className="flex justify-end mb-4">
            <button className="btn btn-primary" onClick={() => { setShowTokenModal(true); setNewRawToken(''); setNewTokenName(''); }}><Plus size={16} /> New Token</button>
          </div>
          <div className="glass-card overflow-hidden">
            <table className="data-table">
              <thead><tr><th>Name</th><th>Prefix</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
              <tbody>
                {tokens.length === 0 ? <tr><td colSpan="5" className="text-center py-10 text-cv-text-muted">No API tokens</td></tr> :
                  tokens.map((t) => (
                    <tr key={t.id}>
                      <td className="font-medium">{t.name}</td>
                      <td className="font-mono text-xs">{t.prefix}...</td>
                      <td><span className={`badge ${t.isActive ? 'badge-active' : 'badge-cancelled'}`}>{t.isActive ? 'Active' : 'Revoked'}</span></td>
                      <td className="text-cv-text-secondary">{new Date(t.createdAt).toLocaleDateString()}</td>
                      <td>{t.isActive && <button className="btn btn-danger btn-sm" onClick={() => revokeToken(t.id)}>Revoke</button>}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {showTokenModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in" onClick={() => setShowTokenModal(false)}>
              <div className="glass-card p-6 w-full max-w-md glow-primary" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-cv-text mb-4">New API Token</h3>
                {newRawToken ? (
                  <div>
                    <p className="text-sm text-cv-warning mb-2">⚠️ Copy this token now — it won't be shown again!</p>
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-cv-surface font-mono text-xs break-all border border-cv-warning/30">
                      {showToken ? newRawToken : '•'.repeat(40)}
                      <button onClick={() => setShowToken(!showToken)} className="flex-shrink-0 text-cv-text-muted hover:text-cv-text">{showToken ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                      <button onClick={() => { navigator.clipboard.writeText(newRawToken); toast.success('Copied!'); }} className="flex-shrink-0 text-cv-text-muted hover:text-cv-text"><Copy size={14} /></button>
                    </div>
                    <button className="btn btn-secondary mt-4" onClick={() => setShowTokenModal(false)}>Done</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div><label className="form-label">Token Name</label><input className="form-input" value={newTokenName} onChange={(e) => setNewTokenName(e.target.value)} placeholder="My Integration" /></div>
                    <div className="flex gap-3"><button className="btn btn-primary" onClick={createToken}>Create</button><button className="btn btn-secondary" onClick={() => setShowTokenModal(false)}>Cancel</button></div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Webhooks */}
      {tab === 'webhooks' && (
        <div>
          <div className="flex justify-end mb-4">
            <button className="btn btn-primary" onClick={() => setShowWebhookModal(true)}><Plus size={16} /> New Webhook</button>
          </div>
          <div className="glass-card overflow-hidden">
            <table className="data-table">
              <thead><tr><th>URL</th><th>Events</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>
                {webhooks.length === 0 ? <tr><td colSpan="4" className="text-center py-10 text-cv-text-muted">No webhooks</td></tr> :
                  webhooks.map((w) => (
                    <tr key={w.id}>
                      <td className="font-mono text-xs max-w-xs truncate">{w.url}</td>
                      <td><div className="flex gap-1 flex-wrap">{(w.events || []).map((e, i) => <span key={i} className="badge badge-finalized text-xs">{e}</span>)}</div></td>
                      <td><span className={`badge ${w.isActive ? 'badge-active' : 'badge-cancelled'}`}>{w.isActive ? 'Active' : 'Disabled'}</span></td>
                      <td className="text-cv-text-secondary">{new Date(w.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {showWebhookModal && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in" onClick={() => setShowWebhookModal(false)}>
              <div className="glass-card p-6 w-full max-w-md glow-primary" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-lg font-bold text-cv-text mb-4">New Webhook Endpoint</h3>
                <div className="space-y-3">
                  <div><label className="form-label">URL</label><input className="form-input" placeholder="https://example.com/webhook" value={webhookForm.url} onChange={(e) => setWebhookForm({ ...webhookForm, url: e.target.value })} /></div>
                  <div><label className="form-label">Events (comma-separated, or leave empty for all)</label><input className="form-input font-mono text-xs" placeholder="invoice.created, subscription.activated" value={webhookForm.events} onChange={(e) => setWebhookForm({ ...webhookForm, events: e.target.value })} /></div>
                </div>
                <div className="flex gap-3 mt-5">
                  <button className="btn btn-primary" onClick={createWebhook}>Create</button>
                  <button className="btn btn-secondary" onClick={() => setShowWebhookModal(false)}>Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      </>
      )}
    </div>
  );
}
