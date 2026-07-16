import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Zap, ArrowLeft, KeyRound, Eye, EyeOff } from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';
import OtpInput, { OtpExpiryBar, OtpResend } from '../../components/ui/OtpInput';

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

  const otpRef = useRef(null);

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

  const handleOtpChange = (next) => {
    setError('');
    setOtp(next);
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
      otpRef.current?.focusFirst();
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
      otpRef.current?.focusFirst();
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
        <div className="glass-card p-7">
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
            <OtpExpiryBar timeLeft={timeLeft} totalSeconds={OTP_EXPIRY_SECONDS} />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* OTP Input */}
            <div>
              <label className="form-label">Reset code</label>
              <OtpInput
                ref={otpRef}
                length={OTP_LENGTH}
                value={otp}
                onChange={handleOtpChange}
                disabled={loading}
                error={!!error}
                submitOnPaste={false}
                label="Reset code"
              />
            </div>

            {/* New password */}
            <div>
              <label className="form-label" htmlFor="reset-password">New password</label>
              <div className="relative">
                <input
                  id="reset-password"
                  type={showPw ? 'text' : 'password'}
                  className="form-input pr-10"
                  placeholder="Min 6 characters"
                  value={newPassword}
                  onChange={(e) => { setError(''); setNewPassword(e.target.value); }}
                  required
                  minLength={6}
                />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-cv-text-muted hover:text-cv-text" aria-label={showPw ? 'Hide password' : 'Show password'}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div>
              <label className="form-label" htmlFor="reset-confirm">Confirm new password</label>
              <input
                id="reset-confirm"
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
              <p className="text-cv-danger text-sm text-center animate-fade-in" role="alert">{error}</p>
            )}

            {/* Submit */}
            <button
              type="submit"
              className="btn btn-primary w-full justify-center py-2.5"
              disabled={loading || otp.some((d) => d === '') || timeLeft <= 0}
            >
              {loading && <span className="btn-spinner" />}
              {loading ? 'Resetting password...' : 'Reset Password'}
            </button>
          </form>

          {/* Resend */}
          <OtpResend cooldown={resendCooldown} resending={resending} onResend={handleResend} />
        </div>
      </div>
    </div>
  );
}
