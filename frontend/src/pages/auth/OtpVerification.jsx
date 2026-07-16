import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Zap, ArrowLeft, ShieldCheck, CheckCircle2 } from 'lucide-react';
import api from '../../api/client';
import { toast } from 'sonner';
import OtpInput, { OtpExpiryBar, OtpResend } from '../../components/ui/OtpInput';

const OTP_LENGTH = 6;
const OTP_EXPIRY_SECONDS = 10 * 60; // 10 minutes
const RESEND_COOLDOWN_SECONDS = 60;

export default function OtpVerification() {
  const navigate = useNavigate();
  const location = useLocation();
  const { email, pendingId } = location.state || {};

  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [error, setError] = useState('');
  const [timeLeft, setTimeLeft] = useState(OTP_EXPIRY_SECONDS);
  const [resendCooldown, setResendCooldown] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);

  const otpRef = useRef(null);

  // Redirect if no pending registration data
  useEffect(() => {
    if (!email || !pendingId) {
      navigate('/register', { replace: true });
    }
  }, [email, pendingId, navigate]);

  // OTP expiry countdown
  useEffect(() => {
    if (timeLeft <= 0 || verified) return;
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, verified]);

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

  const handleVerify = async (code) => {
    if (loading || verified) return;
    setLoading(true);
    setError('');

    try {
      const data = await api.verifyOtp(pendingId, code);

      // Success! Set up auth context
      setVerified(true);
      api.setToken(data.token);
      api.setRole(data.user.role);
      api.setCustomerId(data.user.customerId);
      localStorage.setItem('cv_user', JSON.stringify(data.user));
      if (data.tenant) api.setTenantId(data.tenant.id);

      toast.success('Email verified! Account activated.');

      // Brief pause to show success state, then redirect
      setTimeout(() => {
        navigate(data.user.role === 'user' ? '/portal' : '/dashboard', { replace: true });
      }, 1500);
    } catch (err) {
      setError(err.message);
      // Clear OTP on failure
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
      await api.resendOtp(pendingId);
      toast.success('New verification code sent!');
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

  const handleSubmit = (e) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length !== OTP_LENGTH) {
      setError('Please enter all 6 digits');
      return;
    }
    handleVerify(code);
  };

  if (!email || !pendingId) return null;

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
          <p className="text-cv-text-secondary text-sm">Email Verification</p>
        </div>

        {/* Card */}
        <div className="glass-card p-7">
          {verified ? (
            /* Success State */
            <div className="text-center py-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-cv-success/10 border border-cv-success/30 mb-4">
                <CheckCircle2 size={32} className="text-cv-success" />
              </div>
              <h2 className="text-xl font-bold text-cv-text mb-2">Email Verified!</h2>
              <p className="text-cv-text-secondary text-sm">Your account has been activated. Redirecting...</p>
            </div>
          ) : (
            <>
              {/* Back link */}
              <Link to="/register" className="inline-flex items-center gap-1.5 text-cv-text-muted hover:text-cv-text text-sm mb-5 transition-colors">
                <ArrowLeft size={14} />
                Back to sign up
              </Link>

              {/* Header */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-cv-primary/10 border border-cv-primary/20">
                  <ShieldCheck size={20} className="text-cv-primary" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-cv-text">Check your email</h2>
                  <p className="text-cv-text-muted text-xs">
                    We sent a 6-digit code to <span className="text-cv-text font-medium">{email}</span>
                  </p>
                </div>
              </div>

              {/* Timer */}
              <div className="mt-4 mb-5">
                <OtpExpiryBar timeLeft={timeLeft} totalSeconds={OTP_EXPIRY_SECONDS} />
              </div>

              {/* OTP Input */}
              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <OtpInput
                    ref={otpRef}
                    length={OTP_LENGTH}
                    value={otp}
                    onChange={handleOtpChange}
                    onComplete={handleVerify}
                    disabled={loading || verified}
                    error={!!error}
                  />
                </div>

                {/* Error */}
                {error && (
                  <p className="text-cv-danger text-sm text-center mb-4 animate-fade-in" role="alert">{error}</p>
                )}

                {/* Submit button */}
                <button
                  type="submit"
                  className="btn btn-primary w-full justify-center py-2.5"
                  disabled={loading || otp.some((d) => d === '') || timeLeft <= 0}
                >
                  {loading && <span className="btn-spinner" />}
                  {loading ? 'Verifying...' : 'Verify & Activate Account'}
                </button>
              </form>

              {/* Resend */}
              <OtpResend cooldown={resendCooldown} resending={resending} onResend={handleResend} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
