import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Zap, ArrowLeft, KeyRound } from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.forgotPassword(email);
      // Response is intentionally generic (no account-existence leak). Always advance
      // to the reset screen so the UX is identical whether or not the email is registered.
      toast.success('If an account exists for this email, a reset code has been sent.');
      navigate('/reset-password', { state: { email }, replace: true });
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
          <p className="text-cv-text-secondary text-sm">Reset your password</p>
        </div>

        {/* Card */}
        <div className="glass-card p-7 glow-primary">
          <Link to="/login" className="inline-flex items-center gap-1.5 text-cv-text-muted hover:text-cv-text text-sm mb-5 transition-colors">
            <ArrowLeft size={14} />
            Back to sign in
          </Link>

          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-cv-primary/10 border border-cv-primary/20">
              <KeyRound size={20} className="text-cv-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-cv-text">Forgot your password?</h2>
              <p className="text-cv-text-muted text-xs">Enter your email and we'll send you a reset code.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 mt-5">
            <div>
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-primary w-full justify-center py-2.5" disabled={loading}>
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending reset code...
                </span>
              ) : (
                'Send Reset Code'
              )}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-cv-text-muted">
            Remembered your password?{' '}
            <Link to="/login" className="text-cv-primary hover:text-cv-primary-hover font-medium">Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
