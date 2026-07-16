import { useEffect, useState } from 'react';
import { Activity, Send } from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';
import { formatDate } from '../../lib/format';
import { TableSkeleton } from '../../components/ui/Skeleton';
import Pagination from '../../components/ui/Pagination';
import TabPills from '../../components/ui/TabPills';

export default function EventLog() {
  const [events, setEvents] = useState([]);
  const [pagination, setPagination] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('log'); // log | ingest
  const [ingestForm, setIngestForm] = useState({ customerId: '', eventCode: '', properties: '{}' });
  const [customers, setCustomers] = useState([]);
  const [ingesting, setIngesting] = useState(false);

  const fetchEvents = (page = 1) => {
    setLoading(true);
    setError(null);
    api.getEvents(`page=${page}&perPage=50`).then((d) => { setEvents(d.data); setPagination(d.pagination); })
      .catch((err) => setError(err.message || 'Failed to load events'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchEvents();
    api.getCustomers('perPage=100').then((d) => setCustomers(d.data)).catch(() => {});
  }, []);

  const handleIngest = async () => {
    setIngesting(true);
    try {
      const props = JSON.parse(ingestForm.properties || '{}');
      await api.ingestEvents([{ customerId: ingestForm.customerId, eventCode: ingestForm.eventCode, properties: props }]);
      toast.success('Event ingested!');
      fetchEvents();
    } catch (err) { toast.error(err.message); }
    finally { setIngesting(false); }
  };

  const tabs = [
    { key: 'log', label: 'Event Log' },
    { key: 'ingest', label: 'Ingest' },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-cv-text">Usage Events</h1>
        <TabPills tabs={tabs} active={tab} onChange={setTab} />
      </div>

      {error && <p className="text-sm text-cv-danger mb-4" role="alert">{error}</p>}

      {tab === 'log' ? (
        <>
          <div className="glass-card overflow-hidden">
            <table className="data-table">
              <thead><tr><th>Timestamp</th><th>Customer</th><th>Event Code</th><th>Properties</th></tr></thead>
              {loading ? (
                <TableSkeleton rows={5} cols={4} />
              ) : (
                <tbody>
                  {events.length === 0 ? (
                    <tr><td colSpan="4" className="text-center py-10"><Activity size={32} className="mx-auto mb-2 opacity-30 text-cv-text-muted" /><p className="text-cv-text-muted">No events</p></td></tr>
                  ) : events.map((e) => (
                    <tr key={e.id}>
                      <td className="text-xs text-cv-text-secondary font-mono">{formatDate(e.timestamp, 'datetime')}</td>
                      <td>{e.customer?.name || e.customerId?.slice(0, 8)}</td>
                      <td><span className="font-mono text-xs bg-cv-surface-2 px-2 py-0.5 rounded text-cv-accent">{e.eventCode}</span></td>
                      <td className="font-mono text-xs text-cv-text-muted max-w-xs truncate">{JSON.stringify(e.properties)}</td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={fetchEvents} />
        </>
      ) : (
        <div className="glass-card p-6 max-w-lg">
          <h3 className="text-sm font-semibold text-cv-text mb-4">Ingest Usage Event</h3>
          <div className="space-y-3">
            <div><label className="form-label" htmlFor="event-customer">Customer</label>
              <select id="event-customer" className="form-input" value={ingestForm.customerId} onChange={(e) => setIngestForm({ ...ingestForm, customerId: e.target.value })}>
                <option value="">Select...</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div><label className="form-label" htmlFor="event-code">Event Code</label><input id="event-code" className="form-input font-mono" placeholder="api_calls" value={ingestForm.eventCode} onChange={(e) => setIngestForm({ ...ingestForm, eventCode: e.target.value })} /></div>
            <div><label className="form-label" htmlFor="event-props">Properties (JSON)</label><textarea id="event-props" className="form-input h-24 font-mono text-xs" value={ingestForm.properties} onChange={(e) => setIngestForm({ ...ingestForm, properties: e.target.value })} /></div>
            <button className="btn btn-primary" onClick={handleIngest} disabled={ingesting}>
              {ingesting ? <span className="btn-spinner" /> : <Send size={16} />}
              {ingesting ? 'Ingesting...' : 'Ingest Event'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
