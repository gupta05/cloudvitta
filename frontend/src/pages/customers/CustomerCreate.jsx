import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';

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
      <Link to="/customers" className="inline-flex items-center gap-1.5 text-sm text-cv-text-secondary hover:text-cv-text mb-4"><ArrowLeft size={16} /> Back</Link>
      <h1 className="text-2xl font-bold text-cv-text mb-6">New Customer</h1>
      <div className="glass-card p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="form-label">Name *</label><input className="form-input" value={form.name} onChange={update('name')} required /></div>
          <div><label className="form-label">Alias</label><input className="form-input" placeholder="short-name" value={form.alias} onChange={update('alias')} /></div>
          <div><label className="form-label">Email</label><input type="email" className="form-input" value={form.email} onChange={update('email')} /></div>
          <div><label className="form-label">Phone</label><input className="form-input" value={form.phone} onChange={update('phone')} /></div>
          <div><label className="form-label">Currency</label>
            <select className="form-input" value={form.currency} onChange={update('currency')}>
              <option>INR</option><option>USD</option><option>EUR</option><option>GBP</option>
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Creating...' : 'Create Customer'}</button>
            <Link to="/customers" className="btn btn-secondary">Cancel</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
