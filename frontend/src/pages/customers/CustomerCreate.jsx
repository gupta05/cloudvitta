import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '../../api/client';
import { toast } from 'sonner';
import PageHeader from '../../components/ui/PageHeader';

export default function CustomerCreate() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: '', alias: '', email: '', phone: '', currency: 'INR' });
  const [loading, setLoading] = useState(false);
  const update = (f) => (e) => setForm({ ...form, [f]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const customer = await api.createCustomer(form);
      toast.success('Customer created!');
      navigate(`/customers/${customer.id}`);
    } catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="max-w-xl">
      <PageHeader title="New Customer" backTo="/customers" />
      <div className="glass-card p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="form-label" htmlFor="cust-name">Name *</label><input id="cust-name" className="form-input" value={form.name} onChange={update('name')} required /></div>
          <div><label className="form-label" htmlFor="cust-alias">Alias</label><input id="cust-alias" className="form-input" placeholder="short-name" value={form.alias} onChange={update('alias')} /></div>
          <div><label className="form-label" htmlFor="cust-email">Email</label><input id="cust-email" type="email" className="form-input" value={form.email} onChange={update('email')} /></div>
          <div><label className="form-label" htmlFor="cust-phone">Phone</label><input id="cust-phone" className="form-input" value={form.phone} onChange={update('phone')} /></div>
          <div><label className="form-label" htmlFor="cust-currency">Currency</label>
            <select id="cust-currency" className="form-input" value={form.currency} onChange={update('currency')}>
              <option>INR</option><option>USD</option><option>EUR</option><option>GBP</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading && <span className="btn-spinner" />}
              {loading ? 'Creating...' : 'Create Customer'}
            </button>
            <Link to="/customers" className="btn btn-secondary">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
