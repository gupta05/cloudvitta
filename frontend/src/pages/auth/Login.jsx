import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Zap, Eye, EyeOff } from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const data = await api.login(email, password);
      api.setToken(data.token);
      api.setRole(data.user.role);
      api.setCustomerId(data.user.customerId);
      localStorage.setItem('cv_user', JSON.stringify(data.user));
      if (data.user.tenantId) {
        api.setTenantId(data.user.tenantId);
      } else if (data.tenants?.length > 0) {
        api.setTenantId(data.tenants[0].id);
      }
      toast.success('Welcome back!');
      // Redirect based on role
      navigate(data.user.role === 'user' ? '/portal' : '/dashboard');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-cv-bg">
      <div className="w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-cv-primary">
              <Zap size={24} className="text-white" />
            </div>
            <h1 className="text-3xl font-bold text-cv-text">CloudVitta</h1>
          </div>
          <p className="text-cv-text-secondary text-sm">Cloud Object Storage</p>
        </div>

        {/* Card */}
        <div className="glass-card p-7 glow-primary">
          <h2 className="text-xl font-bold text-cv-text mb-6">Sign in to your account</h2>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="form-label">Email</label>
              <input type="email" className="form-input" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="form-label">Password</label>
                <Link to="/forgot-password" className="text-xs text-cv-primary hover:text-cv-primary-hover font-medium">Forgot password?</Link>
              </div>
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} className="form-input pr-10" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-cv-text-muted hover:text-cv-text">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" className="btn btn-primary w-full justify-center py-2.5" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          <p className="mt-5 text-center text-sm text-cv-text-muted">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="text-cv-primary hover:text-cv-primary-hover font-medium">Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
