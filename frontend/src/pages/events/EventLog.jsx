import { useEffect, useState } from 'react';
import { Activity, Send } from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';

export default function EventLog() {
  const [events, setEvents] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('log'); // log | ingest
  const [ingestForm, setIngestForm] = useState({ customerId: '', eventCode: '', properties: '{}' });
  const [customers, setCustomers] = useState([]);

  useEffect(() => {
    api.getEvents('perPage=50').then((d) => { setEvents(d.data); setPagination(d.pagination); }).finally(() => setLoading(false));
    api.getCustomers('perPage=100').then((d) => setCustomers(d.data));
  }, []);

  const handleIngest = async () => {
    try {
      const props = JSON.parse(ingestForm.properties || '{}');
      await api.ingestEvents([{ customerId: ingestForm.customerId, eventCode: ingestForm.eventCode, properties: props }]);
      toast.success('Event ingested!');
      api.getEvents('perPage=50').then((d) => { setEvents(d.data); setPagination(d.pagination); });
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-cv-text">Usage Events</h1>
        <div className="flex gap-1 p-1 rounded-lg bg-cv-surface-2">
          <button onClick={() => setTab('log')} className={`px-4 py-1.5 rounded-md text-sm font-medium ${tab === 'log' ? 'bg-cv-primary text-white' : 'text-cv-text-secondary'}`}>Event Log</button>
          <button onClick={() => setTab('ingest')} className={`px-4 py-1.5 rounded-md text-sm font-medium ${tab === 'ingest' ? 'bg-cv-primary text-white' : 'text-cv-text-secondary'}`}>Ingest</button>
        </div>
      </div>

      {tab === 'log' ? (
        <div className="glass-card overflow-hidden">
          <table className="data-table">
            <thead><tr><th>Timestamp</th><th>Customer</th><th>Event Code</th><th>Properties</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan="4" className="text-center py-10 text-cv-text-muted">Loading...</td></tr> :
                events.length === 0 ? <tr><td colSpan="4" className="text-center py-10"><Activity size={32} className="mx-auto mb-2 opacity-30 text-cv-text-muted" /><p className="text-cv-text-muted">No events</p></td></tr> :
                events.map((e) => (
                  <tr key={e.id}>
                    <td className="text-xs text-cv-text-secondary font-mono">{new Date(e.timestamp).toLocaleString()}</td>
                    <td>{e.customer?.name || e.customerId?.slice(0, 8)}</td>
                    <td><span className="font-mono text-xs bg-cv-surface-2 px-2 py-0.5 rounded text-cv-accent">{e.eventCode}</span></td>
                    <td className="font-mono text-xs text-cv-text-muted max-w-xs truncate">{JSON.stringify(e.properties)}</td>
                  </tr>
                ))
              }
            </tbody>
          </table>
        </div>
      ) : (
        <div className="glass-card p-6 max-w-lg">
          <h3 className="text-sm font-semibold text-cv-text mb-4">Ingest Usage Event</h3>
          <div className="space-y-3">
            <div><label className="form-label">Customer</label>
              <select className="form-input" value={ingestForm.customerId} onChange={(e) => setIngestForm({ ...ingestForm, customerId: e.target.value })}>
                <option value="">Select...</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label className="form-label">Event Code</label><input className="form-input font-mono" placeholder="api_calls" value={ingestForm.eventCode} onChange={(e) => setIngestForm({ ...ingestForm, eventCode: e.target.value })} /></div>
            <div><label className="form-label">Properties (JSON)</label><textarea className="form-input h-24 font-mono text-xs" value={ingestForm.properties} onChange={(e) => setIngestForm({ ...ingestForm, properties: e.target.value })} /></div>
            <button className="btn btn-primary" onClick={handleIngest}><Send size={16} /> Ingest Event</button>
          </div>
        </div>
      )}
    </div>
  );
}
