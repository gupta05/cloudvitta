import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Zap, ArrowLeft, KeyRound, RefreshCw, Eye, EyeOff } from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';

const OTP_LENGTH = 6;
const OTP_EXPIRY_SECONDS = 10 * 60; // 10 minutes
const RESEND_COOLDOWN_SECONDS = 60;

export default function ResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const { email } = location.state || {};

  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(OTP_EXPIRY_SECONDS);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);

  const inputRefs = useRef([]);

  // Redirect if no email in navigation state (user hit this page directly)
  useEffect(() => {
    if (!email) {
      navigate('/forgot-password', { replace: true });
    }
  }, [email, navigate]);

  // OTP expiry countdown
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  // Resend cooldown countdown
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setInterval(() => setResendCooldown((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [resendCooldown]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleChange = (index, value) => {
    if (value && !/^\d$/.test(value)) return;
    setError('');
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (pasted.length === 0) return;
    setError('');
    const newOtp = [...otp];
    for (let i = 0; i < pasted.length; i++) {
      newOtp[i] = pasted[i];
    }
    setOtp(newOtp);
    const focusIndex = Math.min(pasted.length, OTP_LENGTH - 1);
    inputRefs.current[focusIndex]?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const code = otp.join('');
    if (code.length !== OTP_LENGTH) {
      setError('Please enter all 6 digits of the reset code');
      return;
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      await api.resetPassword({ email, otp: code, newPassword });
      toast.success('Password reset! Please sign in with your new password.');
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err.message);
      // Clear the OTP so the user re-enters a fresh code on failure
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resending || resendCooldown > 0) return;
    setResending(true);
    setError('');
    try {
      await api.resendResetOtp(email);
      toast.success('A new reset code has been sent to your email.');
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setTimeLeft(OTP_EXPIRY_SECONDS);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputRefs.current[0]?.focus();
    } catch (err) {
      if (err.message.includes('wait')) {
        toast.error(err.message);
      } else {
        setError(err.message);
      }
    } finally {
      setResending(false);
    }
  };

  if (!email) return null;

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
          <p className="text-cv-text-secondary text-sm">Set a new password</p>
        </div>

        {/* Card */}
        <div className="glass-card p-7 glow-primary">
          <Link to="/forgot-password" className="inline-flex items-center gap-1.5 text-cv-text-muted hover:text-cv-text text-sm mb-5 transition-colors">
            <ArrowLeft size={14} />
            Back
          </Link>

          {/* Header */}
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-cv-primary/10 border border-cv-primary/20">
              <KeyRound size={20} className="text-cv-primary" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-cv-text">Reset your password</h2>
              <p className="text-cv-text-muted text-xs">
                We sent a 6-digit code to <span className="text-cv-text font-medium">{email}</span>
              </p>
            </div>
          </div>

          {/* Timer */}
          <div className="mt-4 mb-5">
            {timeLeft > 0 ? (
              <div className="flex items-center gap-2 text-xs text-cv-text-muted">
                <div className="w-full bg-cv-surface-2 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000 ease-linear"
                    style={{
                      width: `${(timeLeft / OTP_EXPIRY_SECONDS) * 100}%`,
                      background: timeLeft > 120 ? 'var(--color-cv-primary)' : timeLeft > 60 ? '#f59e0b' : '#ef4444',
                    }}
                  />
                </div>
                <span className="shrink-0 tabular-nums font-mono" style={{ color: timeLeft > 120 ? undefined : timeLeft > 60 ? '#f59e0b' : '#ef4444' }}>
                  {formatTime(timeLeft)}
                </span>
              </div>
            ) : (
              <p className="text-xs text-red-400">Code expired. Please request a new one.</p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* OTP Input */}
            <div>
              <label className="form-label">Reset code</label>
              <div className="flex gap-2 justify-center" onPaste={handlePaste}>
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => (inputRefs.current[index] = el)}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handleChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    disabled={loading}
                    className="w-12 h-14 text-center text-2xl font-bold rounded-lg border bg-cv-surface-2 text-cv-text
                               focus:outline-none focus:ring-2 focus:ring-cv-primary/50 focus:border-cv-primary
                               transition-all duration-200 font-mono
                               disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      borderColor: error ? 'rgba(239, 68, 68, 0.5)' : digit ? 'rgba(99, 102, 241, 0.4)' : 'var(--color-cv-border)',
                      caretColor: 'var(--color-cv-primary)',
                    }}
                    autoFocus={index === 0}
                  />
                ))}
              </div>
            </div>

            {/* New password */}
            <div>
              <label className="form-label">New password</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'}
                  className="form-input pr-10"
                  placeholder="Min 6 characters"
                  value={newPassword}
                  onChange={(e) => { setError(''); setNewPassword(e.target.value); }}
                  required
                  minLength={6}
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-cv-text-muted hover:text-cv-text">
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div>
              <label className="form-label">Confirm new password</label>
              <input
                type={showPw ? 'text' : 'password'}
                className="form-input"
                placeholder="Re-enter your new password"
                value={confirmPassword}
                onChange={(e) => { setError(''); setConfirmPassword(e.target.value); }}
                required
                minLength={6}
              />
            </div>

            {/* Error */}
            {error && (
              <p className="text-red-400 text-sm text-center animate-fade-in">{error}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              className="btn btn-primary w-full justify-center py-2.5"
              disabled={loading || otp.some((d) => d === '') || timeLeft <= 0}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Resetting password...
                </span>
              ) : (
                'Reset Password'
              )}
            </button>
          </form>

          {/* Resend */}
          <div className="mt-5 text-center">
            <p className="text-xs text-cv-text-muted mb-2">Didn't receive the code?</p>
            <button
              onClick={handleResend}
              disabled={resendCooldown > 0 || resending}
              className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ color: resendCooldown > 0 ? 'var(--color-cv-text-muted)' : 'var(--color-cv-primary)' }}
            >
              <RefreshCw size={14} className={resending ? 'animate-spin' : ''} />
              {resending
                ? 'Sending...'
                : resendCooldown > 0
                ? `Resend in ${resendCooldown}s`
                : 'Resend Code'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
