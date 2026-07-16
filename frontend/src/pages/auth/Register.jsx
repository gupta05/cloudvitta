import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Zap, Eye, EyeOff } from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: '', password: '', displayName: '' });
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api.register(form);
      toast.success('Verification code sent to your email!');
      // Navigate to OTP verification page with pending registration data
      navigate('/verify-otp', {
        state: {
          email: data.email,
          pendingId: data.pendingId,
        },
        replace: true,
      });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const update = (field) => (e) => setForm({ ...form, [field]: e.target.value });

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-cv-bg">
      <div className="w-full max-w-md animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-cv-primary">
              <Zap size={24} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold text-cv-text">CloudVitta</h1>
          </div>
          <p className="text-cv-text-secondary text-sm">Get started with 500 MB free storage</p>
        </div>
        <div className="glass-card p-7">
          <h2 className="text-xl font-bold text-cv-text mb-6">Create your account</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label" htmlFor="reg-name">Full Name</label>
              <input id="reg-name" type="text" className="form-input" placeholder="Jane Doe" value={form.displayName} onChange={update('displayName')} required />
            </div>
            <div>
              <label className="form-label" htmlFor="reg-email">Email</label>
              <input id="reg-email" type="email" className="form-input" placeholder="you@company.com" value={form.email} onChange={update('email')} required />
            </div>
            <div>
              <label className="form-label" htmlFor="reg-password">Password</label>
              <div className="relative">
                <input id="reg-password" type={showPw ? 'text' : 'password'} className="form-input pr-10" placeholder="Min 6 characters" value={form.password} onChange={update('password')} required minLength={6} />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-cv-text-muted hover:text-cv-text" aria-label={showPw ? 'Hide password' : 'Show password'}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary w-full justify-center py-2.5" disabled={loading}>
              {loading && <span className="btn-spinner" />}
              {loading ? 'Sending verification code...' : 'Start Free — 500 MB Included'}
            </button>
          </form>
          <p className="mt-3 text-center text-xs text-cv-text-muted">No credit card required. Upgrade anytime.</p>
          <p className="mt-4 text-center text-sm text-cv-text-muted">
            Already have an account?{' '}
            <Link to="/login" className="text-cv-primary hover:text-cv-primary-hover font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
